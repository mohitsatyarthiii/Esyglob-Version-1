import SubscriptionRepository from '../repositories/subscription.repository.js';
import { getMonthsIncluded } from '../lib/subscription-pricing.js';
import { getPlan, listPlans } from '../lib/subscription-plans.js';
import { getAICreditSnapshot, getSubscriptionContext } from '../lib/subscription-access.js';
import Payment from '../models/Payment.js';
import Razorpay from 'razorpay';
import crypto from 'node:crypto';
import Subscription from '../models/Subscription.js';
import { getAICreditPackage, listAICreditPackages } from '../lib/ai-credit-packages.js';

class SubscriptionService {
  static creditPackages() { return { packages: listAICreditPackages() }; }

  static async createCreditOrder(user, { packageKey } = {}) {
    const creditPackage = getAICreditPackage(packageKey);
    if (!creditPackage) throw Object.assign(new Error('Select a valid configured credit package'), { statusCode: 422 });
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) throw Object.assign(new Error('Payment service is not configured'), { statusCode: 503 });
    const userId = user.id || user._id;
    const amountInPaise = Math.round(creditPackage.price * 100);
    const existing = await Payment.findOne({ userId, paymentFor: 'ai_credits', status: { $in: ['initiated', 'pending'] }, 'metadata.packageKey': creditPackage.key }).sort({ createdAt: -1 });
    if (existing?.razorpayOrderId && Math.round(existing.amount * 100) === amountInPaise) return creditOrderResponse(existing, creditPackage, user, true);
    const gateway = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const order = await gateway.orders.create({ amount: amountInPaise, currency: creditPackage.currency, receipt: `credits_${Date.now()}`, notes: { userId: String(userId), purchaseType: 'ai_credits', packageKey: creditPackage.key } });
    const payment = existing || new Payment({ userId, paymentFor: 'ai_credits', type: 'other', method: 'razorpay', paymentMethod: 'razorpay', gateway: 'razorpay' });
    Object.assign(payment, { amount: creditPackage.price, currency: creditPackage.currency, razorpayOrderId: order.id, status: 'initiated', paymentDate: new Date(), description: `${creditPackage.name} AI credit purchase`, metadata: { packageKey: creditPackage.key, credits: creditPackage.credits, purchaseType: 'ai_credits', role: user.primaryRole === 'seller' ? 'seller' : 'buyer' } });
    await payment.save();
    return creditOrderResponse(payment, creditPackage, user, false);
  }

  static async verifyCreditPayment(user, body = {}) {
    const { razorpayPaymentId, razorpayOrderId, razorpaySignature } = body;
    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) throw Object.assign(new Error('Missing required payment fields'), { statusCode: 400 });
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '').update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');
    const left = Buffer.from(expected, 'hex'); const right = Buffer.from(String(razorpaySignature), 'hex');
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw Object.assign(new Error('Invalid payment signature'), { statusCode: 400 });
    const userId = user.id || user._id;
    const payment = await Payment.findOne({ razorpayOrderId, userId, paymentFor: 'ai_credits' });
    if (!payment) throw Object.assign(new Error('Credit payment order mismatch'), { statusCode: 403 });
    const creditPackage = getAICreditPackage(payment.metadata?.packageKey);
    if (!creditPackage || Number(payment.metadata?.credits) !== creditPackage.credits || Math.round(payment.amount * 100) !== Math.round(creditPackage.price * 100)) throw Object.assign(new Error('Credit package configuration mismatch'), { statusCode: 409 });
    const role = payment.metadata?.role === 'seller' ? 'seller' : 'buyer';
    if (payment.status === 'completed') return { success: true, message: 'Credits already added', credits: (await this.getSubscription(user, role)).credits };
    const gateway = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const captured = await gateway.payments.fetch(razorpayPaymentId);
    if (captured.status !== 'captured' || captured.order_id !== razorpayOrderId || Number(captured.amount) !== Math.round(creditPackage.price * 100)) throw Object.assign(new Error('Payment was not captured for the configured package amount'), { statusCode: 400 });
    const context = await getSubscriptionContext(user, role);
    const credited = await Subscription.findOneAndUpdate({ _id: context.subscription._id, creditedPaymentIds: { $ne: payment._id } }, { $inc: { aiCreditsPurchased: creditPackage.credits, aiCreditsAllocated: creditPackage.credits }, $push: { creditedPaymentIds: payment._id } }, { new: true });
    Object.assign(payment, { status: 'completed', razorpayPaymentId, gatewayPaymentId: razorpayPaymentId, razorpaySignature, transactionId: razorpayPaymentId, gatewayResponse: captured, paidAt: new Date(), completedAt: new Date(), subscriptionId: context.subscription._id });
    await payment.save();
    const result = await this.getSubscription(user, role);
    return { success: true, added: credited ? creditPackage.credits : 0, message: credited ? 'Credits added successfully' : 'Credits already added', credits: result.credits };
  }
  /**
   * Get user subscription
   */
  static async getSubscription(user, requestedRole) {
    const userId = user.id || user._id;
    const userType = requestedRole === 'seller' ? 'seller' : requestedRole === 'buyer' ? 'buyer' : user.primaryRole || 'buyer';

    const {subscription,plan}=await getSubscriptionContext(user,userType);
    await subscription.populate({ path: 'paymentHistoryIds', select: 'amount currency status paymentMethod transactionId createdAt description', options: { sort: { createdAt: -1 }, limit: 50 } });
    const usage=subscription.usage||{};
    const limits=plan.restrictions||plan.limits||{};
    const credits = await getAICreditSnapshot(user, userType);
    return { subscription, plan, credits, usage: { ...usage, aiCreditsRemaining: credits.remaining, aiCreditsUsed: credits.used, aiCreditsToday: credits.todayUsed, limits } };
  }

  static async getPlans(user, role) { const resolved=role==='seller'?'seller':'buyer'; return {plans:await listPlans(resolved),role:resolved}; }

  /**
   * Create Razorpay order for subscription plan
   */
  static async createOrder(user, { planType, duration = 'monthly' }) {
    const role=(planType||'').startsWith('seller_')?'seller':(planType||'').startsWith('buyer_')?'buyer':user.primaryRole==='seller'?'seller':'buyer';
    const planDetails=await getPlan(planType,role);
    if (!planDetails || !['monthly','quarterly','yearly'].includes(duration)) {
      throw Object.assign(new Error('Invalid plan type or duration'), { statusCode: 400 });
    }

    // Check Razorpay config
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw Object.assign(new Error('Payment service is not configured'), { statusCode: 503 });
    }

    const priceEntry=planDetails.prices?.[duration];
    const amount = Number(priceEntry?.amount ?? priceEntry ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw Object.assign(new Error('Plan pricing is invalid'), { statusCode: 422 });
    }
    const months = duration==='quarterly'?3:getMonthsIncluded(planType, duration);
    const userId = user.id || user._id;

    const amountInPaise = Math.round(amount * 100);
    const existingPayment = await Payment.findOne({
      userId,
      paymentFor: 'subscription',
      status: { $in: ['initiated', 'pending', 'processing'] },
      'metadata.planType': planType,
      'metadata.duration': duration,
    }).sort({ createdAt: -1 });

    if (
      existingPayment?.razorpayOrderId &&
      Math.round(Number(existingPayment.amount) * 100) === amountInPaise
    ) {
      return {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID,
        orderId: existingPayment.razorpayOrderId,
        paymentId: existingPayment._id,
        amount: amountInPaise,
        currency: existingPayment.currency || 'INR',
        user: { name: user.fullName || user.firstName, email: user.email },
        planDetails: { planType, planName: planDetails.name, duration, months, totalPrice: amount },
        reused: true,
      };
    }

    // Initialize Razorpay
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `sub_${Date.now()}`,
      notes: {
        userId,
        planType,
        duration,
        months,
        totalPrice: amount,
        userEmail: user.email,
      },
    });

    const payment = existingPayment || new Payment({
      userId,
      paymentFor: 'subscription',
      type: 'other',
      method: 'razorpay',
      paymentMethod: 'razorpay',
      gateway: 'razorpay',
    });
    Object.assign(payment, {
      amount,
      currency: razorpayOrder.currency || 'INR',
      razorpayOrderId: razorpayOrder.id,
      status: 'initiated',
      paymentDate: new Date(),
      description: `${planDetails.name} subscription (${duration})`,
      metadata: { planType, duration, months },
    });
    await payment.save();

    return {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID,
      orderId: razorpayOrder.id,
      paymentId: payment._id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      user: {
        name: user.fullName || user.firstName,
        email: user.email,
      },
      planDetails: {
        planType,
        planName: planDetails.name,
        duration,
        months,
        totalPrice: amount,
      },
    };
  }

  /**
   * Toggle auto-renew
   */
  static async toggleAutoRenew(user, autoRenew) {
    if (typeof autoRenew !== 'boolean') {
      throw Object.assign(new Error('Failed to update auto-renew'), { statusCode: 400 });
    }

    const userId = user.id || user._id;
    const subscription = await SubscriptionRepository.toggleAutoRenew(userId, autoRenew);

    if (!subscription) {
      throw Object.assign(new Error('Subscription not found'), { statusCode: 404 });
    }

    return {
      success: true,
      subscription,
      message: `Auto-renew ${autoRenew ? 'enabled' : 'disabled'}`,
    };
  }

  static async changePlan(user, { planType, duration = 'monthly' }) {
    const role = String(planType || '').startsWith('seller_') ? 'seller' : 'buyer';
    const plan = await getPlan(planType, role);
    const priceEntry = plan?.prices?.[duration];
    const amount = Number(priceEntry?.amount ?? priceEntry ?? NaN);
    if (!plan || amount !== 0) throw Object.assign(new Error('Paid plan changes must use secure checkout'), { statusCode: 422 });
    const userId = user.id || user._id;
    await SubscriptionRepository.findOrCreate(userId, role);
    const field = role === 'seller' ? 'sellerPlan' : 'buyerPlan';
    const durationField = role === 'seller' ? 'sellerDuration' : 'buyerDuration';
    const existing = await Subscription.findOne({ userId }).lean();
    await SubscriptionRepository.update(userId, { userType: role, [field]: planType, [durationField]: duration, planKey: planType, billingCycle: duration, isActive: true, status: 'active', startDate: new Date(), expiryDate: null, renewalDate: null, amountPaid: 0, autoRenew: false, aiCreditsAllocated: Number(plan.aiCredits?.monthly ?? plan.aiCredits ?? 0) + Number(existing?.aiCreditsPurchased || 0), aiCreditsUsed: 0 });
    if (role === 'seller') {
      const Seller = (await import('../models/Seller.js')).default;
      await Seller.findOneAndUpdate({ userId }, { $set: { subscriptionPlan: planType, subscriptionStatus: 'active', subscriptionExpiryDate: null } });
    }
    return this.getSubscription(user, role);
  }
}

function creditOrderResponse(payment, creditPackage, user, reused) { return { key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID, orderId: payment.razorpayOrderId, paymentId: payment._id, amount: Math.round(creditPackage.price * 100), currency: creditPackage.currency, package: creditPackage, user: { name: user.fullName || user.name, email: user.email }, reused }; }

export default SubscriptionService;
