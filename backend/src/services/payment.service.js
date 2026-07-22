import PaymentRepository from '../repositories/payment.repository.js';
import { ensurePendingOrderPayment } from '../lib/order-payments.js';
import { markOrderPaymentSucceeded } from '../lib/order-lifecycle.js';
import { recordOrderWalletEntries, recordSubscriptionWalletEntry } from '../lib/wallet-ledger.js';
import { calculateOrderPlatformFee, getOrderBaseAmount, getPlatformFeeRate } from '../lib/platform-fees.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import Seller from '../models/Seller.js';
import Subscription from '../models/Subscription.js';
import { getMonthsIncluded, getPlanDetails, getPlanPrice } from '../lib/subscription-pricing.js';
import { getPlan } from '../lib/subscription-plans.js';
import Invoice from '../models/Invoice.js';

// Initialize Razorpay
let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

function signaturesMatch(expectedSignature, receivedSignature) {
  if (!expectedSignature || !receivedSignature) return false;
  const expected = Buffer.from(expectedSignature, 'hex');
  const received = Buffer.from(String(receivedSignature), 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

class PaymentService {
  /**
   * Get payment by ID
   */
  static async getPayment(paymentId, userId) {
    const payment = await PaymentRepository.findByIdLean(paymentId);
    if (!payment) {
      throw Object.assign(new Error('Payment not found'), { statusCode: 404 });
    }
    if (payment.userId.toString() !== userId.toString()) {
      const order = payment.orderId ? await PaymentRepository.findOrderById(payment.orderId) : null;
      const seller = order?.sellerId ? await Seller.findById(order.sellerId).select('userId').lean() : null;
      if (!seller?.userId || String(seller.userId) !== String(userId)) {
        throw Object.assign(new Error('Unauthorized'), { statusCode: 403 });
      }
    }
    return payment;
  }

  /**
   * Initiate Razorpay order payment
   */
  static async initiateOrderPayment(userId, orderId) {
    if (!razorpay) {
      throw Object.assign(new Error('Payment service not configured'), { statusCode: 503 });
    }
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    }

    const order = await PaymentRepository.findOrderById(orderId);
    if (!order) {
      throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    }

    // Verify ownership
    if (String(order.buyerId || '') !== userId && String(order.userId || '') !== userId) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 403 });
    }

    // Check order status
    if (order.status !== 'pending_payment' || order.paymentStatus === 'paid') {
      throw Object.assign(new Error(`Order status is ${order.status}, not pending_payment`), { statusCode: 400 });
    }

    // Calculate amounts
    const orderAmount = getOrderBaseAmount(order);
    const platformFee = Number(order.platformFee ?? calculateOrderPlatformFee(order));

    if (order.platformFee !== platformFee || !order.merchandiseAmount) {
      order.merchandiseAmount = orderAmount;
      order.platformFee = platformFee;
      order.platformFeeRate = platformFee ? getPlatformFeeRate(orderAmount) : 0;
      order.gatewayFee = Number(order.gatewayFee || 0);
      order.netAmount = Number(order.totalPrice || order.totalAmount || orderAmount + platformFee) - platformFee - order.gatewayFee;
      order.totalPrice = Number(order.totalPrice || order.totalAmount || orderAmount + platformFee);
      order.totalAmount = Number(order.totalAmount || order.totalPrice);
      await order.save();
    }

    const amount = Number(order.totalPrice || order.totalAmount || orderAmount + platformFee || 0);
    const amountInPaise = Math.round(amount * 100);

    if (amountInPaise <= 0) {
      throw Object.assign(new Error('Order amount must be greater than zero'), { statusCode: 400 });
    }

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: order.currency || 'INR',
      receipt: `order_${order._id}`,
      notes: {
        orderId: String(order._id),
        buyerId: userId,
        orderNumber: order.orderNumber || '',
      },
    });

    // Create/find payment record
    let payment = order.paymentId ? await PaymentRepository.findById(order.paymentId) : null;

    if (!payment) {
      payment = await PaymentRepository.findPendingForOrder(order._id, userId);
    }

    if (!payment) {
      payment = await PaymentRepository.create({
        userId,
        paymentFor: 'order',
        orderId: order._id,
        type: 'order_payment',
        method: 'razorpay',
        paymentMethod: 'razorpay',
        gateway: 'razorpay',
      });
    }

    // Update payment details
    payment.amount = amount;
    payment.orderAmount = orderAmount;
    payment.platformFeeRate = platformFee ? getPlatformFeeRate(orderAmount) : 0;
    payment.platformFee = platformFee;
    payment.gatewayFee = Number(order.gatewayFee || 0);
    payment.netAmount = amount - platformFee - Number(order.gatewayFee || 0);
    payment.currency = order.currency || 'INR';
    payment.razorpayOrderId = razorpayOrder.id;
    payment.status = 'initiated';
    payment.paymentDate = new Date();
    await PaymentRepository.save(payment);

    // Link payment to order
    if (String(order.paymentId || '') !== String(payment._id)) {
      order.paymentId = payment._id;
      await order.save();
    }

    return {
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      paymentId: payment._id,
      keyId: process.env.RAZORPAY_KEY_ID,
      orderNumber: order.orderNumber,
    };
  }

  /**
   * Verify order payment
   */
  static async verifyOrderPayment(userId, body) {
    if (!razorpay) {
      throw Object.assign(new Error('Payment service is not configured'), { statusCode: 503 });
    }

    const { razorpayPaymentId, razorpayOrderId, razorpaySignature, paymentId } = body;

    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature || !mongoose.Types.ObjectId.isValid(paymentId)) {
      throw Object.assign(new Error('Invalid payment signature'), { statusCode: 400 });
    }

    // Verify signature
    const sigString = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(sigString)
      .digest('hex');

    if (!signaturesMatch(expectedSignature, razorpaySignature)) {
      throw Object.assign(new Error('Invalid payment signature'), { statusCode: 400 });
    }

    // Verify with Razorpay
    let rzpPayment = null;
    try {
      rzpPayment = await razorpay.payments.fetch(razorpayPaymentId);
      if (rzpPayment.status !== 'captured') {
        throw Object.assign(new Error('Payment not captured'), { statusCode: 400 });
      }
      if (rzpPayment.order_id !== razorpayOrderId) {
        throw Object.assign(new Error('Payment order mismatch'), { statusCode: 400 });
      }
    } catch (error) {
      if (error.statusCode) throw error;
      console.error('Razorpay verification error:', error);
    }

    // Update payment record
    const paymentRecord = await PaymentRepository.findById(paymentId);
    if (!paymentRecord) {
      throw Object.assign(new Error('Payment record not found'), { statusCode: 404 });
    }
    if (paymentRecord.userId.toString() !== userId) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 403 });
    }
    if (order.agreement?.required && order.agreement.status !== 'completed') throw Object.assign(new Error('Agreement signatures are incomplete'), { statusCode: 409 });
    const legacyCheckout = ['direct_order', 'sample_order'].includes(order.orderSubType) && Boolean(order.shippingMethod) && order.tradeInformation?.termsAccepted === true;
    if (!order.checkout?.logisticsSelected && !legacyCheckout) throw Object.assign(new Error('Select a logistics plan before payment'), { statusCode: 409 });
    if ((!order.checkout?.termsAccepted || !order.checkout?.termsAcknowledgement) && !legacyCheckout) throw Object.assign(new Error('Digitally acknowledge the trade terms before payment'), { statusCode: 409 });
    if (!order.checkout?.orderValidated && !legacyCheckout) throw Object.assign(new Error('Order validation is incomplete'), { statusCode: 409 });
    if (paymentRecord.razorpayOrderId !== razorpayOrderId) {
      throw Object.assign(new Error('Payment order mismatch'), { statusCode: 400 });
    }
    if (rzpPayment?.amount && Math.round(Number(paymentRecord.amount || 0) * 100) !== Number(rzpPayment.amount)) {
      throw Object.assign(new Error('Payment amount mismatch'), { statusCode: 400 });
    }

    paymentRecord.razorpayPaymentId = razorpayPaymentId;
    paymentRecord.gatewayPaymentId = razorpayPaymentId;
    paymentRecord.razorpaySignature = razorpaySignature;
    paymentRecord.status = 'completed';
    paymentRecord.paidAt = paymentRecord.paidAt || new Date();
    paymentRecord.transactionId = razorpayPaymentId;
    await PaymentRepository.save(paymentRecord);

    // Update order
    let order = await PaymentRepository.findOrderById(paymentRecord.orderId);
    if (order) {
      const wasOrderPaid = order.paymentStatus === 'paid';
      const lifecycle = await markOrderPaymentSucceeded({
        order, payment: paymentRecord, updatedBy: userId,
      });
      order = lifecycle.order;

      // Update seller stats
      const sellerNetRevenue = Number(order.netAmount ?? (Number(order.totalPrice || order.totalAmount || 0) - Number(order.platformFee || 0) - Number(order.gatewayFee || 0)));
      const sellerUpdate = !wasOrderPaid
        ? { $inc: { totalOrders: 1, totalRevenue: sellerNetRevenue } }
        : { $set: { updatedAt: new Date() } };

      const seller = await Seller.findOneAndUpdate(
        { $or: [{ _id: order.sellerId }, { userId: order.sellerId }] },
        sellerUpdate,
        { new: true }
      ).select('userId').exec();

      // Notify seller
      await Notification.create({
        userId: seller?.userId || order.sellerId,
        notificationType: 'payment_received',
        title: 'Payment Received',
        description: `Payment received for order #${order.orderNumber}. Ready to process.`,
        data: {
          relatedId: order._id,
          relatedModel: 'Order',
          actionUrl: `/dashboard/seller/orders?orderId=${order._id}`,
        },
      });

      // Record wallet entries
      await recordOrderWalletEntries({ order, payment: paymentRecord });
    }

    return { success: true, paymentRecord, order };
  }

  /**
   * Verify subscription payment
   */
  static async verifySubscriptionPayment(userId, body) {
    if (!razorpay) {
      throw Object.assign(new Error('Payment service is not configured'), { statusCode: 503 });
    }

    const { razorpayPaymentId, razorpayOrderId, razorpaySignature, planType, duration = 'monthly' } = body;

    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature || !planType) {
      throw Object.assign(new Error('Missing required payment fields'), { statusCode: 400 });
    }

    // Verify signature
    const sigString = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(sigString)
      .digest('hex');

    if (!signaturesMatch(expectedSignature, razorpaySignature)) {
      throw Object.assign(new Error('Invalid payment signature'), { statusCode: 400 });
    }

    // Check duplicate
    const existingPayment = await PaymentRepository.findByRazorpayPaymentId(razorpayPaymentId);
    if (existingPayment) {
      if (String(existingPayment.userId) !== String(userId)) {
        throw Object.assign(new Error('Unauthorized'), { statusCode: 403 });
      }
      return { success: true, message: 'Payment already verified', payment: existingPayment };
    }

    // Verify with Razorpay
    let subscriptionRzpPayment = null;
    try {
      subscriptionRzpPayment = await razorpay.payments.fetch(razorpayPaymentId);
      if (subscriptionRzpPayment.status !== 'captured') {
        throw Object.assign(new Error('Payment not captured'), { statusCode: 400 });
      }
      if (subscriptionRzpPayment.order_id !== razorpayOrderId) {
        throw Object.assign(new Error('Payment order mismatch'), { statusCode: 400 });
      }
    } catch (error) {
      if (error.statusCode) throw error;
      console.error('Razorpay verification error:', error);
    }

    // Plan details
    const isSellerPlan = planType.startsWith('seller_') || planType === 'verified_batch' || planType === 'verified_supplier';
    const role=isSellerPlan?'seller':'buyer';
    const configuredPlan=await getPlan(planType,role);
    const planDetails = configuredPlan || getPlanDetails(planType);
    if (!planDetails) {
      throw Object.assign(new Error('Invalid subscription plan'), { statusCode: 400 });
    }

    const configuredPrice=configuredPlan?.prices?.[duration];
    const expectedAmount = Number(configuredPrice?.amount ?? configuredPrice ?? getPlanPrice(planType, duration));
    if (Number(subscriptionRzpPayment?.amount || 0) !== Math.round(expectedAmount * 100)) {
      throw Object.assign(new Error('Subscription amount mismatch'), { statusCode: 400 });
    }

    const months = duration==='quarterly'?3:getMonthsIncluded(planType, duration);
    const startDate = new Date();
    const expiryDate = new Date(startDate);
    expiryDate.setMonth(expiryDate.getMonth() + months);

    // Find or create subscription
    let subscription = await Subscription.findOne({ userId }).exec();
    if (!subscription) {
      subscription = new Subscription({
        userId,
        userType: isSellerPlan ? 'seller' : 'buyer',
        isActive: true,
      });
    }

    // Update subscription
    if (isSellerPlan) {
      subscription.userType = 'seller';
      subscription.sellerPlan = planType;
      subscription.sellerDuration = duration;
      subscription.isVerifiedSupplier = true;
      subscription.verificationExpiresAt = expiryDate;
    } else {
      subscription.userType = 'buyer';
      subscription.buyerPlan = planType;
      subscription.buyerDuration = duration;
    }

    subscription.startDate = startDate;
    subscription.renewalDate = expiryDate;
    subscription.expiryDate = expiryDate;
    subscription.billingCycle = duration;
    subscription.isActive = true;
    subscription.autoRenew = true;
    subscription.status = 'active';
    subscription.planKey = configuredPlan?.key || planType;
    subscription.aiCreditsAllocated = Number(configuredPlan?.aiCredits?.monthly ?? configuredPlan?.aiCredits ?? 0);
    subscription.aiCreditsUsed = 0;
    subscription.usage = {};
    const usageResetAt = new Date(startDate); usageResetAt.setMonth(usageResetAt.getMonth()+1); subscription.usageResetAt=usageResetAt; subscription.creditsResetAt=usageResetAt;
    const amount = Number(subscriptionRzpPayment?.amount || 0) / 100;
    subscription.amountPaid = amount;
    await subscription.save();
    if (isSellerPlan && configuredPlan) {
      await Seller.findOneAndUpdate({ userId }, { $set: { subscriptionPlan: configuredPlan.key, subscriptionStatus: 'active', subscriptionExpiryDate: expiryDate, verificationStatus: 'verified', verificationLevel: Math.max(1, Number(configuredPlan.priorityRanking || 0) + 1) }, $inc: { trustScore: Number(configuredPlan.trustScoreBoost || 0) } });
    }

    // Create payment record
    const paymentRecord = await PaymentRepository.create({
      userId,
      paymentFor: 'subscription',
      subscriptionId: subscription._id,
      amount,
      currency: 'INR',
      paymentMethod: 'razorpay',
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
      status: 'completed',
      paidAt: new Date(),
      transactionId: razorpayPaymentId,
      metadata: { planType, duration, months },
    });

    const invoice = await Invoice.create({ invoiceNumber:`ESY-SUB-${Date.now()}`, buyerId:userId, currency:'INR', subtotal:amount, taxAmount:0, totalAmount:amount, status:'paid', paymentStatus:'paid', issuedAt:new Date(), transactionId:razorpayPaymentId, paymentMethod:'Razorpay', paymentDate:new Date(), lineItems:[{description:`${planDetails.name} subscription (${duration})`,quantity:1,unit:'plan',unitPrice:amount,total:amount}], serviceSnapshot:{type:'subscription',planKey:configuredPlan?.key||planType,duration}, terms:['Subscription benefits apply for the active billing period.'] });
    paymentRecord.invoiceUrl=`/api/invoices/${invoice._id}`; await paymentRecord.save();

    // Update payment history
    if (!subscription.paymentHistoryIds) subscription.paymentHistoryIds = [];
    subscription.paymentHistoryIds.push(paymentRecord._id);
    subscription.lastPaymentId = paymentRecord._id;
    await subscription.save();

    // Record wallet entry
    await recordSubscriptionWalletEntry({
      user: { id: userId, _id: userId, roles: isSellerPlan ? ['seller'] : ['buyer'] },
      payment: paymentRecord,
      subscription,
    });

    // Notify
    await Notification.create({
      userId,
      notificationType: 'subscription_renewed',
      title: `${planDetails.name} Activated`,
      description: `Your subscription is active until ${expiryDate.toLocaleDateString('en-IN')}.`,
      data: {
        relatedId: subscription._id,
        relatedModel: 'Subscription',
        actionUrl: '/dashboard/settings',
      },
    });

    return { success: true, message: 'Payment verified successfully', subscription, payment: paymentRecord, invoice };
  }
}

export default PaymentService;
