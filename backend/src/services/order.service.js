import OrderRepository from '../repositories/order.repository.js';
import NotificationService from './notification.service.js';
import { buildCheckoutQuote } from '../lib/checkout-quote.js';
import { buildAutomatedOrderServices } from '../lib/order-automation.js';
import { getOrderFulfillment, notifyOrderStatus, syncShipmentFromOrderStatus } from '../lib/order-lifecycle.js';
import mongoose from 'mongoose';

const allowedTransitions = {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['awaiting_payment', 'rejected', 'cancelled'],
  awaiting_payment: ['payment_confirmed', 'cancelled'],
  pending_payment: ['payment_confirmed', 'cancelled'],
  payment_success: ['payment_confirmed', 'confirmed', 'cancelled', 'refunded'],
  payment_confirmed: ['confirmed', 'processing', 'preparing_shipment', 'cancelled', 'refunded'],
  confirmed: ['processing', 'preparing_shipment', 'production', 'cancelled'],
  processing: ['production', 'preparing_shipment', 'ready_to_ship', 'cancelled'],
  production: ['ready_to_ship', 'preparing_shipment', 'cancelled'],
  ready_to_ship: ['pickup_scheduled', 'shipped', 'cancelled'],
  preparing_shipment: ['pickup_scheduled', 'picked_up', 'cancelled'],
  pickup_scheduled: ['picked_up', 'cancelled'],
  picked_up: ['warehouse_processing', 'in_transit', 'cancelled'],
  warehouse_processing: ['in_transit', 'custom_clearance', 'cancelled'],
  custom_clearance: ['in_transit', 'out_for_delivery', 'cancelled'],
  in_transit: ['custom_clearance', 'out_for_delivery', 'delivered', 'returned'],
  out_for_delivery: ['delivered', 'returned'],
  shipped: ['in_transit', 'delivered', 'disputed'],
  delivered: ['completed', 'disputed'],
  disputed: ['refunded', 'completed'],
};

function toObjectId(value) {
  if (!value) return null;
  const raw = typeof value === 'object' ? value._id || value.id : value;
  const id = String(raw || '');
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
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
      order.buyerId?._id?.toString() === userId ||
      order.userId?.toString() === userId ||
      order.sellerId?.userId?.toString() === userId ||
      order.sellerId?._id?.toString() === userId;
    const isAdmin = roles?.includes('admin');

    if (!isParticipant && !isAdmin) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 403 });
    }

    const fulfillment = await getOrderFulfillment(order._id);
    const payload = order.toObject();
    payload.shipment = fulfillment.shipment;
    payload.invoice = fulfillment.invoice;

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
      const permitted = allowedTransitions[order.status] || [];
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

      order.status = status;
      order.timeline.push({
        status, timestamp: new Date(),
        note: notes || '', updatedBy: userId,
      });

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

    return { order: payload };
  }
}

export default OrderService;
