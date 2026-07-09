import SubscriptionRepository from '../repositories/subscription.repository.js';
import { isValidPlan, getPlanPrice, getMonthsIncluded, getPlanDetails } from '../lib/subscription-pricing.js';
import Razorpay from 'razorpay';

class SubscriptionService {
  /**
   * Get user subscription
   */
  static async getSubscription(user) {
    const userId = user.id || user._id;
    const userType = user.primaryRole || 'buyer';

    const subscription = await SubscriptionRepository.findOrCreate(userId, userType);
    return { subscription };
  }

  /**
   * Create Razorpay order for subscription plan
   */
  static async createOrder(user, { planType, duration = 'monthly' }) {
    // Validate plan
    if (!planType || !isValidPlan(planType, duration)) {
      throw Object.assign(new Error('Invalid plan type or duration'), { statusCode: 400 });
    }

    // Check Razorpay config
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw Object.assign(new Error('Failed to create payment order'), { statusCode: 500 });
    }

    const planDetails = getPlanDetails(planType);
    const amount = getPlanPrice(planType, duration);
    const months = getMonthsIncluded(planType, duration);
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