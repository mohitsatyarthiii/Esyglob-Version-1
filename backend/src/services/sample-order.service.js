import SampleOrderRepository from '../repositories/sample-order.repository.js';
import NotificationService from './notification.service.js';
import { buildCheckoutQuote } from '../lib/checkout-quote.js';
import { buildAutomatedOrderServices } from '../lib/order-automation.js';
import mongoose from 'mongoose';

class SampleOrderService {
  /**
   * Create a sample order
   */
  static async createSampleOrder(userId, body) {
    const {
      productId,
      quantity: rawQuantity,
      shippingAddress,
      termsAccepted,
      logisticsOption,
      notes,
    } = body;

    // Validate terms acceptance
    if (termsAccepted !== true) {
      throw Object.assign(
        new Error('Terms and conditions must be accepted before placing the order'),
        { statusCode: 400 }
      );
    }

    // Validate product ID
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      throw Object.assign(new Error('Invalid product id'), { statusCode: 400 });
    }

    const orderQuantity = Math.max(Number(rawQuantity || 1), 1);

    // Get product
    const product = await SampleOrderRepository.findProduct(productId);
    if (!product) {
      throw Object.assign(new Error('Product not found'), { statusCode: 404 });
    }

    // Get seller
    const sellerId = product.sellerId;
    const sellerUserId = product.userId;
    const seller = await SampleOrderRepository.findSeller(sellerId);

    if (!sellerId) {
      throw Object.assign(new Error('Seller not found'), { statusCode: 400 });
    }

    // Build checkout quote
    const quote = await buildCheckoutQuote({
      product,
      seller,
      quantity: orderQuantity,
      orderType: 'sample',
      orderSubType: 'sample_order',
      destination: shippingAddress || {},
      selectedLogisticsKey: logisticsOption,
    });

    if (!quote.selectedLogistics) {
      throw Object.assign(
        new Error('Please select a valid logistics option'),
        { statusCode: 400 }
      );
    }

    // Build automation services
    const automation = buildAutomatedOrderServices({
      quote,
      seller,
      product,
      logisticsOption: quote.selectedLogistics,
    });

    // Calculate pricing
    const pricePerUnit = quote.unitPrice;
    const merchandiseAmount = quote.productTotal + quote.logisticsCharges;
    const platformFee = quote.platformFee;
    const totalPrice = quote.grandTotal;

    // Generate order number
    const orderNumber = await SampleOrderRepository.generateOrderNumber('SAM');

    // Build order data
    const orderData = {
      orderNumber,
      userId,
      buyerId: userId,
      sellerId,
      productId: product._id,
      orderType: 'sample',
      orderSubType: 'sample_order',
      quantity: orderQuantity,
      pricePerUnit,
      totalPrice,
      subtotal: quote.productTotal,
      shippingCost: quote.logisticsCharges,
      taxAmount: quote.gstAmount,
      merchandiseAmount,
      platformFeeRate: quote.platformFeeRate,
      platformFee,
      gatewayFee: 0,
      netAmount: totalPrice - platformFee,
      totalAmount: totalPrice,
      currency: 'INR',
      unit: product.unit || 'piece',
      shippingMethod: quote.selectedLogistics.key,
      tradeAssurance: automation.tradeAssurance,
      platformServices: automation.platformServices,
      tradeInformation: {
        logistics: automation.logistics,
        compliance: automation.compliance,
        termsAccepted: true,
        acceptedPolicies: ['terms', 'privacy', 'return_policy', 'trade_rules'],
        platformFeeSlab: quote.platformFeeSlab,
        notes: notes || '',
      },
      documents: automation.documentsRequired.map(type => ({
        type,
        status: 'pending',
        source: 'system',
      })),
      status: 'pending_payment',
      paymentStatus: 'pending',
      shippingAddress: {
        fullName: shippingAddress?.fullName || '',
        name: shippingAddress?.fullName || '',
        email: shippingAddress?.email || '',
        phone: shippingAddress?.phone || '',
        address: shippingAddress?.address || '',
        city: shippingAddress?.city || '',
        state: shippingAddress?.state || '',
        zipCode: shippingAddress?.zipCode || '',
        postalCode: shippingAddress?.zipCode || '',
        country: shippingAddress?.country || 'India',
      },
      products: [{
        productId: product._id,
        name: product.name,
        quantity: orderQuantity,
        unit: product.unit || 'piece',
        unitPrice: pricePerUnit,
        totalPrice: quote.productTotal,
        image: product.images?.[0] || '',
      }],
      timeline: [
        {
          status: 'order_created',
          timestamp: new Date(),
          note: `Sample order created with ${quote.selectedLogistics.label} logistics`,
          updatedBy: userId,
        },
        {
          status: 'services_attached',
          timestamp: new Date(),
          note: 'Buyer protection, secure payment, tracking, GST invoice, and document automation attached',
          updatedBy: userId,
        },
        {
          status: 'pending_payment',
          timestamp: new Date(),
          note: 'Payment pending',
          updatedBy: userId,
        },
      ],
    };

    // Create order
    const order = await SampleOrderRepository.createOrder(orderData);

    // Create pending payment
    let payment = null;
    try {
      const { ensurePendingOrderPayment } = await import('../lib/order-payments.js');
      payment = await ensurePendingOrderPayment(order, {
        userId,
        amount: totalPrice,
        currency: 'INR',
      });

      if (payment) {
        order.paymentId = payment._id;
        await SampleOrderRepository.saveOrder(order);
      }
    } catch (error) {
      console.error('Payment creation error:', error);
      // Order is still created even if payment fails
    }

    // Notify seller
    if (sellerUserId) {
      try {
        await NotificationService.createNotification({
          userId: sellerUserId,
          notificationType: 'order_placed',
          title: 'New sample order received',
          description: `${product.name} - Qty: ${orderQuantity}`,
          data: {
            relatedId: order._id,
            relatedModel: 'Order',
            actionUrl: `/dashboard/seller/orders/${order._id}`,
          },
        });
      } catch (error) {
        console.error('Notification error:', error);
      }
    }

    return { success: true, order };
  }
}

export default SampleOrderService;