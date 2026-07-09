import Subscription from '../models/Subscription.js';

class SubscriptionRepository {
  /**
   * Find subscription by userId
   */
  static async findByUserId(userId) {
    return Subscription.findOne({ userId });
  }

  /**
   * Find or create subscription
   */
  static async findOrCreate(userId, userType = 'buyer') {
    let subscription = await Subscription.findOne({ userId });

    if (!subscription) {
      subscription = new Subscription({
        userId,
        userType,
        isActive: true,
      });
      await subscription.save();
    }

    return subscription;
  }

  /**
   * Update subscription
   */
  static async update(userId, data) {
    return Subscription.findOneAndUpdate(
      { userId },
      { $set: data },
      { new: true, runValidators: true }
    );
  }

  /**
   * Update auto-renew setting
   */
  static async toggleAutoRenew(userId, autoRenew) {
    return Subscription.findOneAndUpdate(
      { userId },
      { $set: { autoRenew } },
      { new: true, runValidators: true }
    );
  }

  /**
   * Save subscription
   */
  static async save(subscription) {
    return subscription.save();
  }
}

export default SubscriptionRepository;