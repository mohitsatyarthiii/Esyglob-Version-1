import SubscriptionRepository from '../repositories/subscription.repository.js';
import { getMonthsIncluded } from '../lib/subscription-pricing.js';
import { getPlan, listPlans } from '../lib/subscription-plans.js';
import { getSubscriptionContext } from '../lib/subscription-access.js';
import Razorpay from 'razorpay';

class SubscriptionService {
  /**
   * Get user subscription
   */
  static async getSubscription(user, requestedRole) {
    const userId = user.id || user._id;
    const userType = requestedRole === 'seller' ? 'seller' : requestedRole === 'buyer' ? 'buyer' : user.primaryRole || 'buyer';

    const {subscription,plan}=await getSubscriptionContext(user,userType);
    const usage=subscription.usage||{}; const limits=plan.limits||{};
    return { subscription, plan, usage: { ...usage, aiCreditsRemaining: Math.max(0,Number(subscription.aiCreditsAllocated||plan.aiCredits)-Number(subscription.aiCreditsUsed||0)), aiCreditsUsed:Number(subscription.aiCreditsUsed||0), limits } };
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

    const amount = Number(planDetails.prices?.[duration]||0);
    const months = duration==='quarterly'?3:getMonthsIncluded(planType, duration);
    const userId = user.id || user._id;

    // Initialize Razorpay
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: amount * 100, // Convert to paise
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

    return {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID,
      orderId: razorpayOrder.id,
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
}

export default SubscriptionService;
