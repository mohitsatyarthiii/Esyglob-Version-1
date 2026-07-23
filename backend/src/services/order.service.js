import OrderRepository from '../repositories/order.repository.js';
import NotificationService from './notification.service.js';
import { buildCheckoutQuote, DEFAULT_LOGISTICS_RULES } from '../lib/checkout-quote.js';
import { buildAutomatedOrderServices } from '../lib/order-automation.js';
import { getOrderFulfillment, notifyOrderStatus, syncShipmentFromOrderStatus } from '../lib/order-lifecycle.js';
import mongoose from 'mongoose';
import { getIO } from '../lib/socket.js';
import TradeWorkflowService from './trade-workflow.service.js';

function toObjectId(value) {
  if (!value) return null;
  const raw = typeof value === 'object' ? value._id || value.id : value;
  const id = String(raw || '');
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
}

function idString(value) {
  if (!value) return '';
  if (typeof value === 'object') {
    return String(value._id || value.id || '');
  }
  return String(value);
}

function cleanAddress(address = {}) {
  return {
    name: address.name || address.fullName || '',
    fullName: address.fullName || address.name || '',
    company: address.company || address.companyName || '',
    email: address.email || '',
    phone: address.phone || '',
    address: address.address || address.shippingAddress || '',
    city: address.city || '',
    state: address.state || '',
    country: address.country || 'India',
    postalCode: address.postalCode || address.zipCode || '',
    zipCode: address.zipCode || address.postalCode || '',
  };
}

class OrderService {
  /**
   * List orders (buyer or seller view)
   */
  static async listOrders(userId, query = {}) {
    const { type = 'buyer', status, orderType, limit } = query;

    if (type === 'seller') {
      const seller = await OrderRepository.findSellerByUserId(userId);
      if (!seller) return { orders: [] };
      const orders = await OrderRepository.findBySeller(seller._id, { status, orderType, limit });
      return { orders };
    }

    const orders = await OrderRepository.findByBuyer(userId, { status, orderType, limit });
    return { orders };
  }

  /**
   * Get single order detail
   */
  static async getOrder(userId, roles, orderId) {
    const order = await OrderRepository.findByIdFull(orderId);
    if (!order) {
      throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    }

    // Authorization check
    const isParticipant =
      idString(order.buyerId) === String(userId) ||
      idString(order.userId) === String(userId) ||
      idString(order.sellerId?.userId) === String(userId) ||
      idString(order.sellerId) === String(userId);
    const isAdmin = roles?.includes('admin');

    if (!isParticipant && !isAdmin) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 403 });
    }

    const fulfillment = await getOrderFulfillment(order._id);
    const payload = order.toObject();
    payload.shipment = fulfillment.shipment;
    payload.invoice = fulfillment.invoice;
    payload.workflowSnapshot = await TradeWorkflowService.snapshot(order, isAdmin ? 'admin' : idString(order.buyerId || order.userId) === String(userId) ? 'buyer' : 'seller');
    payload.logisticsOptions = DEFAULT_LOGISTICS_RULES.map(option => ({
      key: option.key,
      label: option.mode === 'express' ? 'Enterprise Logistics' : option.mode === 'premium' ? 'Premium Logistics' : 'Standard Logistics',
      mode: option.mode,
      eta: option.eta,
      price: Number(option.baseCharge || 0) + Number(order.subtotal || order.totalAmount || 0) * Number(option.variableRate || 0),
      currency: order.currency || 'INR',
      incoterm: option.incoterm,
      features: option.mode === 'express' ? ['Priority handling', 'Full insurance', 'Live tracking', 'Dedicated support'] : option.mode === 'premium' ? ['Enhanced insurance', 'Milestone tracking', 'Priority support'] : ['Standard coverage', 'Shipment tracking', 'Marketplace support'],
    }));

    return { order: payload };
  }

  /**
   * Create order (sample or bulk)
   */
  static async createOrder(userId, body) {
    const productId = toObjectId(body.productId);
    const quantity = Math.max(Number(body.quantity || 1), 1);
    const orderType = body.orderType === 'sample' ? 'sample' : 'bulk';
    const orderSubType = body.orderSubType || (orderType === 'sample' ? 'sample_order' : 'direct_order');
    const rfqId = toObjectId(body.rfqId);
    const quotationId = toObjectId(body.quotationId);
    const chatId = toObjectId(body.chatId);
    const logisticsOption = String(body.logisticsOption || body.tradeInformation?.shippingOption || '').trim();
    const termsAccepted = body.termsAccepted === true;

    if (!productId) {
      throw Object.assign(new Error('Valid product ID is required'), { statusCode: 400 });
    }
    if (!termsAccepted) {
      throw Object.assign(new Error('Terms and conditions must be accepted before placing the order'), { statusCode: 400 });
    }

    // Get product with seller
    const product = await OrderRepository.findProductWithSeller(productId);
    if (!product) {
      throw Object.assign(new Error('Product not found'), { statusCode: 404 });
    }

    const seller = product.sellerId;
    if (!seller?._id) {
      throw Object.assign(new Error('Seller not found for this product'), { statusCode: 400 });
    }
    if (String(product.userId || seller.userId) === String(userId)) {
      throw Object.assign(new Error('You cannot order your own product'), { statusCode: 400 });
    }

    // Check direct order eligibility
    const isDirectProductOrder = orderSubType === 'direct_order' && !quotationId;
    if (isDirectProductOrder) {
      const canStartOrder =
        ['active', 'published'].includes(product.status) &&
        (product.directOrderEnabled || product.orderType === 'direct_order_enabled') &&
        seller.isActive !== false &&
        seller.isSuspended !== true &&
        seller.isTrustedSeller === true &&
        seller.trustedSellerBadge === 'active';

      if (!canStartOrder) {
        throw Object.assign(
          new Error('Start Order is available only for Esyglob Trusted Seller products with Direct Order enabled'),
          { statusCode: 403 }
        );
      }
    }

    // Check minimum quantity
    const minimumQuantity = orderType === 'sample' ? 1 : Number(product.minimumOrderQuantity || 1);
    if (quantity < minimumQuantity) {
      throw Object.assign(new Error(`Minimum order quantity is ${minimumQuantity}`), { statusCode: 400 });
    }

    // Build quote
    const quote = await buildCheckoutQuote({
      product, seller, quantity, orderType, orderSubType,
      destination: cleanAddress(body.shippingAddress),
      selectedLogisticsKey: logisticsOption,
    });

    if (!quote.selectedLogistics) {
      throw Object.assign(new Error('Please select a valid logistics option'), { statusCode: 400 });
    }

    // Build automation
    const automation = buildAutomatedOrderServices({ quote, seller, product, logisticsOption: quote.selectedLogistics });
    const pricePerUnit = quote.unitPrice;
    const subtotal = quote.productTotal;
    const shippingCharge = quote.logisticsCharges;
    const merchandiseAmount = quote.productTotal + quote.logisticsCharges;
    const platformFee = quote.platformFee;
    const platformFeeRate = quote.platformFeeRate;
    const gstAmount = quote.gstAmount;
    const totalAmount = quote.grandTotal;
    const requiresPayment = body.paymentRequired !== false;

    // Generate order number
    const prefix = orderType === 'sample' ? 'SAM' : 'ORD';
    const orderNumber = await OrderRepository.generateOrderNumber(prefix);

    // Create order
    const order = await OrderRepository.create({
      orderNumber,
      userId,
      buyerId: userId,
      sellerId: seller._id,
      productId: product._id,
      rfqId,
      quotationId,
      chatId,
      orderType,
      orderSubType,
      quantity,
      pricePerUnit,
      totalPrice: totalAmount,
      subtotal,
      shippingCost: shippingCharge,
      taxAmount: gstAmount,
      merchandiseAmount,
      platformFeeRate,
      platformFee,
      gatewayFee: 0,
      netAmount: totalAmount - platformFee,
      totalAmount,
      currency: product.currency || 'INR',
      status: requiresPayment ? 'pending_payment' : 'pending_approval',
      paymentStatus: requiresPayment ? 'pending' : 'pending',
      shippingAddress: cleanAddress(body.shippingAddress),
      products: [{
        productId: product._id,
        name: product.name,
        quantity,
        unit: product.unit || 'piece',
        unitPrice: pricePerUnit,
        totalPrice: subtotal,
        specifications: body.tradeInformation?.productSpecifications || '',
        image: product.images?.[0] || '',
      }],
      buyerCompany: body.buyerCompany || null,
      sellerCompany: body.sellerCompany || {
        companyName: seller.companyName,
        registrationNumber: seller.businessRegistrationNumber || seller.gstNumber || '',
      },
      platformServices: automation.platformServices,
      tradeAssurance: automation.tradeAssurance,
      shippingMethod: quote.selectedLogistics.key,
      checkout: {
        logisticsSelected: true,
        logisticsOption: quote.selectedLogistics.key,
        logisticsSnapshot: quote.selectedLogistics,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        termsVersion: 'trade-terms-v1',
        termsAcknowledgement: 'Accepted during secure marketplace checkout',
        orderValidated: true,
        validatedAt: new Date(),
      },
      trackingNumber: '',
      sourceSnapshot: {
        product: {
          name: product.name, category: product.category,
          subcategory: product.subcategory, price: product.price,
          minimumOrderQuantity: product.minimumOrderQuantity,
        },
        seller: {
          companyName: seller.companyName, companyType: seller.companyType,
          isVerified: seller.isVerified, isTrustedSeller: seller.isTrustedSeller,
          trustedSellerBadge: seller.trustedSellerBadge,
          address: seller.address, businessEmail: seller.businessEmail,
          businessPhone: seller.businessPhone,
        },
      },
      timeline: [
        {
          status: 'order_created', timestamp: new Date(),
          note: `${orderSubType === 'direct_order' ? 'Direct product order created' : 'Order created'} with ${quote.selectedLogistics.label} logistics`,
          updatedBy: userId,
        },
        {
          status: 'services_attached', timestamp: new Date(),
          note: 'Trade Assurance, secure payment, tracking, document management, risk checks, GST invoice, and purchase order automation attached',
          updatedBy: userId,
        },
        {
          status: requiresPayment ? 'pending_payment' : 'pending_approval',
          timestamp: new Date(),
          note: requiresPayment ? 'Payment pending' : 'Awaiting approval',
          updatedBy: userId,
        },
      ],
      buyerNotes: body.buyerNotes || body.orderNotes || '',
      documents: automation.documentsRequired.map(type => ({
        type, status: 'pending', source: 'system',
      })),
      tradeInformation: {
        ...(body.tradeInformation || {}),
        logistics: automation.logistics,
        compliance: automation.compliance,
        termsAccepted: true,
        acceptedPolicies: ['terms', 'privacy', 'return_policy', 'trade_rules'],
        platformFeeSlab: quote.platformFeeSlab,
      },
    });

    // Create pending payment
    if (requiresPayment) {
      try {
        const { ensurePendingOrderPayment } = await import('../lib/order-payments.js');
        const payment = await ensurePendingOrderPayment(order, {
          userId,
          amount: totalAmount,
          currency: product.currency || 'INR',
          unit: product.unit || 'piece',
        });
        order.paymentId = payment?._id;
        await OrderRepository.save(order);
      } catch (error) {
        console.error('Payment creation error:', error);
      }
    }

    // Notify seller
    if (seller.userId) {
      await NotificationService.createNotification({
        userId: seller.userId,
        notificationType: 'order_placed',
        title: orderType === 'sample' ? 'New sample order received' : 'New order received',
        description: `${product.name} - Qty: ${quantity}`,
        data: {
          relatedId: order._id,
          relatedModel: 'Order',
          actionUrl: `/dashboard/seller/orders/${order._id}`,
        },
      }).catch(error => console.error('Order notification error:', error));
    }

    const io = getIO();
    if (io) {
      const event = { orderId: String(order._id), chatId: order.chatId ? String(order.chatId) : undefined, status: order.status };
      io.to(`user_${userId}`).emit('order_updated', event);
      if (seller.userId) io.to(`user_${seller.userId}`).emit('order_updated', event);
      if (order.chatId) io.to(`chat_${order.chatId}`).emit('order_updated', event);
    }

    return { success: true, order };
  }

  /**
   * Update order status (seller only)
   */
  static async updateOrderStatus(userId, roles, orderId, data) {
    const { status, trackingNumber, estimatedDeliveryDate, notes } = data;

    const order = await OrderRepository.findByIdFull(orderId);
    if (!order) {
      throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    }

    // Authorization - only seller or admin
    const seller = await OrderRepository.findSellerByUserId(userId);
    const orderSellerId = String(order.sellerId?._id || order.sellerId || '');
    const isSeller = orderSellerId === String(seller?._id || '');
    const isAdmin = roles?.includes('admin');

    if (!isSeller && !isAdmin) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 403 });
    }

    if (status) {
      const permitted = TradeWorkflowService.allowedNext(order.status);
      if (!permitted.includes(status) && !isAdmin) {
        throw Object.assign(
          new Error(`Cannot move order from ${order.status} to ${status}`),
          { statusCode: 409 }
        );
      }
      if ((status === 'payment_confirmed' || status === 'confirmed') && order.paymentStatus !== 'paid') {
        throw Object.assign(
          new Error('Payment must be verified before the order can be marked payment confirmed'),
          { statusCode: 409 }
        );
      }

      await TradeWorkflowService.transition({ order, toStatus: status, actorId: userId, actorRole: isAdmin ? 'admin' : 'seller', note: notes || '', isAdmin });

      await notifyOrderStatus(order, { status, userId });
    }

    if (trackingNumber) order.trackingNumber = trackingNumber;
    if (estimatedDeliveryDate) order.estimatedDeliveryDate = estimatedDeliveryDate;

    await syncShipmentFromOrderStatus(order, {
      status, trackingNumber, estimatedDeliveryDate, updatedBy: userId,
    });

    await OrderRepository.save(order);

    const fulfillment = await getOrderFulfillment(order._id);
    const payload = order.toObject();
    payload.shipment = fulfillment.shipment;
    payload.invoice = fulfillment.invoice;
    payload.workflowSnapshot = await TradeWorkflowService.snapshot(order);

    const io = getIO();
    if (io) {
      const event = { orderId: String(order._id), chatId: order.chatId ? String(order.chatId) : undefined, status: order.status };
      io.to(`user_${order.userId}`).emit('order_updated', event);
      if (order.sellerId?.userId) io.to(`user_${order.sellerId.userId}`).emit('order_updated', event);
      if (order.chatId) io.to(`chat_${order.chatId}`).emit('order_updated', event);
    }

    return { order: payload };
  }

  static async sellerQueue(userId, query = {}) {
    const seller = await OrderRepository.findSellerByUserId(userId);
    if (!seller) return { items: [] };
    const [{ default: RFQ }, { default: Quotation }, { default: Order }] = await Promise.all([import('../models/RFQ.js'), import('../models/Quotation.js'), import('../models/Order.js')]);
    const limit = Math.min(Math.max(Number(query.limit) || 80, 1), 150);
    const [rfqs, quotations, orders] = await Promise.all([
      RFQ.find({ status: { $in: ['active','submitted','pending','viewed','information_requested','seller_accepted','ready_for_quotation','replied','quoted','negotiating'] }, $or: [{ sellerUserId: userId }, { specificSupplierIds: seller._id }, ...(seller.productCategories?.length ? [{ visibility:'public', category:{ $in:seller.productCategories } }] : [])] }).populate('buyerId','fullName email companyName').populate('productId','name images price minimumOrderQuantity unit').sort({ updatedAt: -1 }).limit(limit).lean(),
      Quotation.find({ sellerId: seller._id, status: { $in: ['pending','submitted','negotiating','countered','revision_requested','revised','buyer_accepted','final_quotation_pending','final_quotation_signed','agreement_pending','agreement_signed'] } }).populate({ path:'rfqId', populate:{ path:'buyerId', select:'fullName email companyName' } }).populate('productId','name images price minimumOrderQuantity unit').sort({ updatedAt:-1 }).limit(limit).lean(),
      Order.find({ sellerId: seller._id, status: { $in: ['draft','requested','pending','pending_approval','awaiting_payment','pending_payment','payment_confirmed','confirmed','processing','production','delayed','waiting_buyer_response','ready_to_ship','preparing_shipment','pickup_scheduled','picked_up','warehouse_processing','custom_clearance','in_transit','out_for_delivery','shipped','delivered','disputed'] } }).populate('buyerId','fullName email companyName').populate('productId','name images price minimumOrderQuantity unit').populate('rfqId','title quantity unit').populate('quotationId','unitPrice totalPrice status').sort({ updatedAt:-1 }).limit(limit).lean(),
    ]);
    const orderRfqIds = new Set(orders.map(item => idString(item.rfqId)));
    const items = [
      ...orders.map(order => ({ queueType:'order', queueId:order._id, orderId:order._id, buyer:order.buyerId, product:order.productId, rfq:order.rfqId, quotation:order.quotationId, quantity:order.quantity, unit:order.unit, unitPrice:order.pricePerUnit, totalAmount:order.totalAmount, status:order.status, negotiationStatus:order.quotationId?.status, documents:order.tradeDocuments?.length || order.documents?.length || 0, updatedAt:order.updatedAt })),
      ...quotations.filter(item => !item.tradeOrderId && !orderRfqIds.has(idString(item.rfqId)) && !(item.status === 'final_quotation_pending' && item.finalQuotation?.sellerSignedAt)).map(item => ({ queueType:'quotation', queueId:item._id, quotationId:item._id, rfqId:item.rfqId?._id, buyer:item.rfqId?.buyerId, product:item.productId, rfq:item.rfqId, quantity:item.suppliedQuantity, unitPrice:item.unitPrice, totalAmount:item.totalPrice, status:item.status, negotiationStatus:item.status, documents:item.tradeDocuments?.length || item.attachments?.length || 0, updatedAt:item.updatedAt })),
      ...rfqs.filter(item => !item.tradeOrderId && !orderRfqIds.has(idString(item._id))).map(item => ({ queueType:'rfq', queueId:item._id, rfqId:item._id, buyer:item.buyerId, product:item.productId, rfq:item, quantity:item.quantity, unit:item.unit, unitPrice:item.targetPrice, status:item.status, negotiationStatus:item.status, documents:item.tradeDocuments?.length || item.attachments?.length || item.documents?.length || 0, updatedAt:item.updatedAt })),
    ].sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
    return { items };
  }

  static async startOrder(userId, body) {
    const [{ default: RFQ }, { default: Quotation }, { default: Product }, { default: Seller }, { default: Order }] = await Promise.all([import('../models/RFQ.js'), import('../models/Quotation.js'), import('../models/Product.js'), import('../models/Seller.js'), import('../models/Order.js')]);
    const rfq = body.rfqId && mongoose.Types.ObjectId.isValid(body.rfqId) ? await RFQ.findById(body.rfqId) : null;
    const quotation = body.quotationId && mongoose.Types.ObjectId.isValid(body.quotationId) ? await Quotation.findById(body.quotationId) : null;
    if (!quotation) throw Object.assign(new Error('A Final Quotation is required before Start Order.'), { statusCode: 422 });
    const sourceRfq = rfq || await RFQ.findById(quotation.rfqId);
    if (!sourceRfq) throw Object.assign(new Error('The linked RFQ could not be found'), { statusCode: 404 });
    const seller = await Seller.findById(quotation.sellerId).select('_id userId companyName').lean();
    if (!seller) throw Object.assign(new Error('Seller profile not found'), { statusCode: 404 });
    const actorRole = idString(sourceRfq.buyerId) === String(userId) ? 'buyer' : idString(seller.userId) === String(userId) ? 'seller' : '';
    if (!actorRole) throw Object.assign(new Error('Only the Buyer or Seller for this Final Quotation can start the order'), { statusCode: 403 });
    if (quotation.status !== 'final_quotation_signed' || quotation.finalQuotation?.status !== 'signed') throw Object.assign(new Error('Order creation is locked until the Buyer signs the Final Quotation'), { statusCode:409 });
    const productId = toObjectId(body.productId || quotation?.productId || sourceRfq?.productId);
    const product = productId ? await Product.findOne({ _id: productId, sellerId: seller._id }).lean() : null;
    if (!product) throw Object.assign(new Error('A linked Seller product is required before starting the order'), { statusCode: 422 });
    const existingOrder = await Order.findOne({ quotationId: quotation._id });
    if (existingOrder) return { order: existingOrder };
    if (sourceRfq.tradeOrderId || quotation?.tradeOrderId) throw Object.assign(new Error('An order already exists for this trade'), { statusCode: 409 });
    const sellerInput = actorRole === 'seller' ? body : {};
    const quantity = Math.max(Number(sellerInput.quantity || quotation?.suppliedQuantity || sourceRfq.quantity || 1), 1);
    const minimumOrderQuantity = Math.max(Number(sellerInput.minimumOrderQuantity || quotation?.minimumOrderQuantity || product.minimumOrderQuantity || 1), 1);
    if (quantity < minimumOrderQuantity) throw Object.assign(new Error(`Final quantity must meet MOQ ${minimumOrderQuantity}`), { statusCode: 422 });
    const unitPrice = Math.max(Number(sellerInput.unitPrice ?? quotation?.unitPrice ?? product.price ?? 0), 0);
    const shippingCost = Math.max(Number(sellerInput.shippingCost ?? quotation?.shippingCost ?? 0), 0);
    const taxAmount = Math.max(Number(sellerInput.taxAmount ?? quotation?.taxes?.amount ?? 0), 0);
    const discount = Math.max(Number(sellerInput.discount || 0), 0);
    const subtotal = unitPrice * quantity;
    const totalAmount = Math.max(0, subtotal + shippingCost + taxAmount - discount);
    const orderNumber = await OrderRepository.generateOrderNumber('ORD');
    const order = await OrderRepository.create({ orderNumber, userId:sourceRfq.buyerId, buyerId:sourceRfq.buyerId, sellerId:seller._id, productId:product._id, rfqId:sourceRfq._id, quotationId:quotation._id, orderType:'bulk', orderSubType:'trade_order', quantity, unit:sellerInput.unit || product.unit || sourceRfq.unit, pricePerUnit:unitPrice, subtotal, shippingCost, taxAmount, discount, totalPrice:totalAmount, totalAmount, netAmount:totalAmount, currency:sellerInput.currency || quotation.currency || product.currency || 'INR', paymentStatus:'pending', status:'pending_approval', products:[{ productId:product._id, name:product.name, sku:sellerInput.sku, quantity, unit:sellerInput.unit || product.unit, unitPrice, totalPrice:subtotal, specifications:sellerInput.specifications || sourceRfq.specifications, image:product.images?.[0] }], sellerNotes:sellerInput.notes || '', tradeInformation:{ paymentTerms:quotation.paymentTerms, deliveryTerms:quotation.incoterms, leadTime:quotation.leadTime, productionTime:quotation.productionTime, minimumOrderQuantity, logisticsConfiguredBySeller:sellerInput.logistics || null, configuredBySeller:actorRole === 'seller', initiatedBy:actorRole, commercialTermsLockedAt:quotation.finalQuotation?.lockedAt || new Date() }, documents:Array.isArray(sellerInput.documents)?sellerInput.documents:[], tradeDocuments:quotation.tradeDocuments || [], timeline:[{ status:'rfq_created', note:`RFQ ${sourceRfq.title} linked`, updatedBy:sourceRfq.buyerId },{ status:'quotation_accepted', note:`Quotation version ${quotation.revisionNumber} accepted`, updatedBy:sourceRfq.buyerId },{ status:'final_quotation_signed', note:'Buyer signed the Final Quotation', updatedBy:sourceRfq.buyerId },{ status:'order_started', note:`${actorRole === 'buyer' ? 'Buyer' : 'Seller'} started checkout from locked Final Quotation terms`, updatedBy:userId },{ status:'pending_approval', note:'Waiting for buyer checkout validation', updatedBy:userId }], checkout:{ logisticsSelected:false, termsAccepted:false, orderValidated:false } });
    await order.save();
    sourceRfq.tradeOrderId=order._id; sourceRfq.status='order_initiated'; sourceRfq.activityTimeline.push({ action:'order_started', status:'order_initiated', message:`Order ${orderNumber} started`, actorId:userId, actorRole }); await sourceRfq.save();
    quotation.tradeOrderId=order._id; quotation.previousStatus=quotation.status; quotation.status='won'; quotation.activityTimeline.push({ action:'order_started', status:'won', message:`${actorRole === 'buyer' ? 'Buyer' : 'Seller'} started order ${orderNumber}`, actorId:userId, actorRole, metadata:{ orderId:order._id } }); await quotation.save();
    const recipientId = actorRole === 'buyer' ? seller.userId : sourceRfq.buyerId;
    await NotificationService.createNotification({ userId:recipientId, notificationType:'trade_order_created', title:'Checkout started from signed Final Quotation', description:`Order ${orderNumber} now uses the locked Final Quotation terms.`, data:{ relatedId:order._id, relatedModel:'Order', actionUrl:`/orders/${order._id}${actorRole === 'buyer' ? '?role=seller' : ''}` }, priority:'high' }).catch(()=>{});
    return { order };
  }

  static async buyerAction(userId, orderId, data) {
    const order = await OrderRepository.findByIdFull(orderId);
    if (!order) throw Object.assign(new Error('Order not found'), { statusCode:404 });
    if (idString(order.buyerId || order.userId) !== String(userId)) throw Object.assign(new Error('Only the buyer can perform this action'), { statusCode:403 });
    if (data.action === 'select_logistics') {
      if (!['pending_approval','pending_payment','awaiting_payment'].includes(order.status)) throw Object.assign(new Error('Logistics can only be selected before payment'), { statusCode:409 });
      const option = DEFAULT_LOGISTICS_RULES.find(item => item.key === data.logisticsOption);
      if (!option) throw Object.assign(new Error('Select a valid logistics plan'), { statusCode:422 });
      order.checkout ||= {};
      order.checkout.logisticsSelected = true;
      order.checkout.logisticsOption = option.key;
      order.checkout.logisticsSnapshot = { key: option.key, label: option.label, mode: option.mode, eta: option.eta, incoterm: option.incoterm, price: Number(option.baseCharge || 0) + Number(order.subtotal || order.totalAmount || 0) * Number(option.variableRate || 0) };
      order.shippingMethod = option.key;
      if (order.checkout.termsAccepted) { order.checkout.orderValidated = true; order.checkout.validatedAt = new Date(); }
      order.timeline.push({ status: order.status, previousStatus: order.status, newStatus: order.status, action: 'select_logistics', actorRole: 'buyer', note: `${option.label} selected`, updatedBy:userId, metadata: order.checkout.logisticsSnapshot });
    } else if (data.action === 'accept_terms') {
      if (!['pending_approval','pending_payment','awaiting_payment'].includes(order.status)) throw Object.assign(new Error('Terms can only be accepted before payment'), { statusCode:409 });
      if (data.accepted !== true || !String(data.acknowledgement || '').trim()) throw Object.assign(new Error('Digital terms acknowledgement is required'), { statusCode:422 });
      order.checkout ||= {};
      order.checkout.termsAccepted = true;
      order.checkout.termsAcceptedAt = new Date();
      order.checkout.termsVersion = String(data.termsVersion || 'trade-terms-v1');
      order.checkout.termsAcknowledgement = String(data.acknowledgement).trim();
      if (order.checkout.logisticsSelected) { order.checkout.orderValidated = true; order.checkout.validatedAt = new Date(); }
      order.timeline.push({ status: order.status, previousStatus: order.status, newStatus: order.status, action: 'accept_terms', actorRole: 'buyer', note: 'Buyer digitally acknowledged trade terms', updatedBy:userId });
    } else if (data.action === 'approve') {
      if (order.status !== 'pending_approval') throw Object.assign(new Error('Order is not awaiting buyer approval'), { statusCode:409 });
      if (order.agreement?.required && order.agreement.status !== 'completed') throw Object.assign(new Error('The required commercial document is incomplete'), { statusCode:409 });
      if (!order.checkout?.logisticsSelected) throw Object.assign(new Error('Select a logistics plan before approval'), { statusCode:409 });
      if (!order.checkout?.termsAccepted) throw Object.assign(new Error('Review and digitally acknowledge the terms before approval'), { statusCode:409 });
      order.checkout.orderValidated = true; order.checkout.validatedAt = new Date();
      order.approvalHistory.push({ action:'buyer_approved_checkout', previousStatus:order.status, newStatus:'pending_payment', actorId:userId, actorRole:'buyer', notes:data.notes || 'Final Quotation, logistics and terms validated' });
      await TradeWorkflowService.transition({ order, toStatus:'pending_payment', actorId:userId, actorRole:'buyer', note:data.notes || 'Buyer approved final terms' });
      const { ensurePendingOrderPayment } = await import('../lib/order-payments.js');
      const payment = await ensurePendingOrderPayment(order,{ userId, amount:order.totalAmount, currency:order.currency, unit:order.unit }); order.paymentId=payment?._id;
    } else if (data.action === 'request_revision') {
      if (order.status !== 'pending_approval') throw Object.assign(new Error('Order is not awaiting buyer review'), { statusCode:409 });
      await TradeWorkflowService.transition({ order, toStatus:'pending_approval', actorId:userId, actorRole:'buyer', note:data.notes || 'Buyer requested order changes' });
      order.approvalHistory.push({ action:'request_revision', previousStatus:'pending_approval', newStatus:'pending_approval', actorId:userId, actorRole:'buyer', notes:data.notes || 'Buyer requested order changes', documents:data.documents || [] });
    } else if (data.action === 'reject_changes') {
      await TradeWorkflowService.transition({ order, toStatus:'rejected', actorId:userId, actorRole:'buyer', note:data.notes || 'Buyer rejected final terms' });
      order.approvalHistory.push({ action:'reject_changes', previousStatus:'pending_approval', newStatus:'rejected', actorId:userId, actorRole:'buyer', notes:data.notes || 'Buyer rejected final terms', documents:data.documents || [] });
    }
    else if (data.action === 'cancel') { if (!['pending','pending_approval','awaiting_payment','pending_payment'].includes(order.status)) throw Object.assign(new Error('Order can no longer be cancelled directly'), { statusCode:409 }); await TradeWorkflowService.transition({ order, toStatus:'cancelled', actorId:userId, actorRole:'buyer', note:data.notes || 'Cancelled by buyer' }); order.cancelReason=data.notes || 'Cancelled by buyer'; order.cancelledAt=new Date(); }
    else if (data.action === 'confirm_delivery') { if (order.status !== 'delivered') throw Object.assign(new Error('Delivery is not ready for confirmation'), { statusCode:409 }); await TradeWorkflowService.transition({ order, toStatus:'completed', actorId:userId, actorRole:'buyer', note:data.notes || 'Buyer confirmed delivery' }); order.completedAt=new Date(); }
    else throw Object.assign(new Error('Invalid buyer action'), { statusCode:422 });
    if (['select_logistics', 'accept_terms'].includes(data.action) && order.status === 'pending_approval' && order.tradeInformation?.initiatedBy === 'buyer' && order.checkout?.logisticsSelected && order.checkout?.termsAccepted) {
      order.checkout.orderValidated = true;
      order.checkout.validatedAt = new Date();
      order.approvalHistory.push({ action:'buyer_completed_checkout', previousStatus:'pending_approval', newStatus:'pending_payment', actorId:userId, actorRole:'buyer', notes:'Buyer completed checkout for the signed Final Quotation' });
      await TradeWorkflowService.transition({ order, toStatus:'pending_payment', actorId:userId, actorRole:'buyer', note:'Checkout requirements completed; payment is ready' });
      const { ensurePendingOrderPayment } = await import('../lib/order-payments.js');
      const payment = await ensurePendingOrderPayment(order,{ userId, amount:order.totalAmount, currency:order.currency, unit:order.unit });
      order.paymentId = payment?._id;
    }
    await OrderRepository.save(order);
    const sellerUserId = order.sellerId?.userId?._id || order.sellerId?.userId;
    if (sellerUserId) await NotificationService.createNotification({ userId:sellerUserId, notificationType:order.status==='cancelled'?'order_cancelled':order.status==='completed'?'order_completed':'order_pending_payment', title:`Buyer ${String(data.action).replaceAll('_',' ')}`, description:`Order ${order.orderNumber} was updated by the buyer.`, data:{ relatedId:order._id, relatedModel:'Order', actionUrl:`/orders/${order._id}?role=seller` } }).catch(()=>{});
    return { order };
  }

  static async addProductionUpdate(userId, roles, orderId, data) {
    const stages = ['raw_material_purchased', 'raw_material_procured', 'manufacturing_started', 'manufacturing', 'assembly_running', 'quality_control', 'quality_inspection', 'packaging', 'production_completed'];
    if (!stages.includes(data.stage)) throw Object.assign(new Error('Invalid production stage'), { statusCode: 400 });
    const order = await OrderRepository.findByIdFull(orderId);
    if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    const seller = await OrderRepository.findSellerByUserId(userId);
    const isSeller = String(order.sellerId?._id || order.sellerId || '') === String(seller?._id || '');
    const isAdmin = roles?.includes('admin');
    if (!isSeller && !isAdmin) throw Object.assign(new Error('Unauthorized'), { statusCode: 403 });
    if (!['confirmed', 'processing', 'production'].includes(order.status)) throw Object.assign(new Error('Production updates are not available at this workflow stage'), { statusCode: 409 });
    order.production ||= { status: 'not_started', updates: [] };
    order.production.status = data.stage;
    order.production.updates.push({ stage: data.stage, note: data.note || '', attachments: Array.isArray(data.attachments) ? data.attachments : [], updatedBy: userId, timestamp: new Date() });
    if (!order.production.startedAt) order.production.startedAt = new Date();
    if (data.stage === 'production_completed') order.production.completedAt = new Date();
    const target = data.stage === 'production_completed' ? 'ready_to_ship' : 'production';
    if (order.status !== target) await TradeWorkflowService.transition({ order, toStatus: target, actorId: userId, actorRole: isAdmin ? 'admin' : 'seller', note: data.note || data.stage.replace(/_/g, ' '), isAdmin });
    else order.timeline.push({ status: data.stage, timestamp: new Date(), note: data.note || '', updatedBy: userId });
    await OrderRepository.save(order);
    await NotificationService.createNotification({ userId:order.buyerId || order.userId, notificationType:'order_status_updated', title:`Production: ${String(data.stage).replaceAll('_',' ')}`, description:data.note || `Order ${order.orderNumber} production milestone updated.`, data:{ relatedId:order._id, relatedModel:'Order', actionUrl:`/trade-workspace/order/${order._id}`, stage:data.stage }, priority:'high' }).catch(()=>{});
    const payload = order.toObject();
    payload.workflowSnapshot = await TradeWorkflowService.snapshot(order);
    return { order: payload };
  }
}

export default OrderService;
