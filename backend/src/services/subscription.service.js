import SubscriptionRepository from '../repositories/subscription.repository.js';
import { getMonthsIncluded } from '../lib/subscription-pricing.js';
import { getPlan, listPlans } from '../lib/subscription-plans.js';
import { getSubscriptionContext } from '../lib/subscription-access.js';
import Payment from '../models/Payment.js';
import Razorpay from 'razorpay';

class SubscriptionService {
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
    const planCredits=Number(plan.aiCredits?.monthly ?? plan.aiCredits ?? 0);
    const allocated=Number(subscription.aiCreditsAllocated ?? planCredits);
    return { subscription, plan, usage: { ...usage, aiCreditsRemaining: Math.max(0,allocated-Number(subscription.aiCreditsUsed||0)), aiCreditsUsed:Number(subscription.aiCreditsUsed||0), limits } };
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
    await SubscriptionRepository.update(userId, { userType: role, [field]: planType, [durationField]: duration, planKey: planType, billingCycle: duration, isActive: true, status: 'active', startDate: new Date(), expiryDate: null, renewalDate: null, amountPaid: 0, autoRenew: false, aiCreditsAllocated: Number(plan.aiCredits?.monthly ?? plan.aiCredits ?? 0), aiCreditsUsed: 0 });
    if (role === 'seller') {
      const Seller = (await import('../models/Seller.js')).default;
      await Seller.findOneAndUpdate({ userId }, { $set: { subscriptionPlan: planType, subscriptionStatus: 'active', subscriptionExpiryDate: null } });
    }
    return this.getSubscription(user, role);
  }
}

export default SubscriptionService;
