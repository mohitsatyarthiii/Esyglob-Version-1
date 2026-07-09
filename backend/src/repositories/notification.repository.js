import Notification from '../models/Notification.js';
import mongoose from 'mongoose';

// Notification type category mapping
export const NOTIFICATION_CATEGORIES = {
  messages: ['message', 'message_received'],
  enquiries: ['new_inquiry', 'rfq_created'],
  orders: [
    'order_placed', 'order_pending', 'order_pending_approval',
    'order_awaiting_payment', 'order_pending_payment', 'order_payment_confirmed',
    'order_confirmed', 'order_processing', 'order_production',
    'order_ready_to_ship', 'order_shipped', 'order_delivered',
    'order_completed', 'order_cancelled', 'order_refunded',
    'order_rejected', 'order_disputed', 'trade_order_created',
    'rfq_converted_to_order', 'payment_received', 'sample_order_update',
  ],
  reviews: ['review_received', 'review_response', 'rating_received'],
  services: [
    'service_request_created', 'service_request_updated',
    'shipment_created', 'shipment_in_transit', 'shipment_delivered', 'shipment_booked',
    'inspection_scheduled', 'inspection_completed',
    'escrow_created', 'escrow_funded', 'escrow_released',
    'financing_applied', 'financing_approved',
    'customs_submitted', 'customs_cleared',
    'warehouse_order_created', 'inventory_added',
  ],
  account: [
    'verification_approved', 'subscription_expiring', 'subscription_renewed',
    'account_update', 'system_alert',
  ],
  products: ['product_viewed', 'product_update', 'supplier_response'],
};

class NotificationRepository {
  /**
   * Get notifications list with pagination
   */
  static async getUserNotifications(userId, options = {}) {
    const {
      unreadOnly = false,
      status = 'all',
      category = 'all',
      page = 1,
      limit = 20,
    } = options;

    const query = { userId };

    // Filter by read status
    if (unreadOnly) {
      query.isRead = false;
    } else if (status === 'read') {
      query.isRead = true;
    } else if (status === 'unread') {
      query.isRead = false;
    }

    // Filter by category
    if (category !== 'all' && NOTIFICATION_CATEGORIES[category]) {
      query.notificationType = { $in: NOTIFICATION_CATEGORIES[category] };
    }

    const skip = (page - 1) * limit;

    const [notifications, unreadCount, total, categoryCounts] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ userId, isRead: false }),
      Notification.countDocuments(query),
      Notification.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: '$notificationType',
            count: { $sum: 1 },
            unread: { $sum: { $cond: ['$isRead', 0, 1] } },
          },
        },
      ]),
    ]);

    // Build category counts
    const counts = Object.fromEntries(
      Object.entries(NOTIFICATION_CATEGORIES).map(([key, types]) => [
        key,
        categoryCounts
          .filter(item => types.includes(item._id))
          .reduce((sum, item) => sum + item.count, 0),
      ])
    );

    return {
      notifications,
      unreadCount,
      total,
      counts,
      pagination: {
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Mark all notifications as read
   */
  static async markAllAsRead(userId) {
    const result = await Notification.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    return { modifiedCount: result.modifiedCount || 0 };
  }

  /**
   * Delete notifications by scope
   */
  static async deleteNotifications(userId, scope = 'read') {
    const query = { userId };

    if (scope === 'read') {
      query.isRead = true;
    }
    // scope === 'all' - delete all user's notifications

    const result = await Notification.deleteMany(query);
    return { deletedCount: result.deletedCount || 0 };
  }

  /**
   * Mark single notification as read
   */
  static async markAsRead(notificationId, userId) {
    if (!mongoose.Types.ObjectId.isValid(notificationId)) return null;

    return Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true, lean: true }
    );
  }

  /**
   * Delete single notification
   */
  static async deleteOne(notificationId, userId) {
    if (!mongoose.Types.ObjectId.isValid(notificationId)) return null;

    return Notification.findOneAndDelete(
      { _id: notificationId, userId }
    ).lean();
  }

  /**
   * Create a notification
   */
  static async create(data) {
    return Notification.create(data);
  }

  /**
   * Create notifications for multiple users
   */
  static async createForUsers(userIds, data) {
    const notifications = userIds.map(userId => ({
      ...data,
      userId,
      isRead: false,
      createdAt: new Date(),
    }));
    return Notification.insertMany(notifications);
  }
}

export default NotificationRepository;