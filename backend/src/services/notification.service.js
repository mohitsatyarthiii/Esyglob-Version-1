import NotificationRepository, { NOTIFICATION_CATEGORIES } from '../repositories/notification.repository.js';

class NotificationService {
  /**
   * Get user notifications with pagination and filters
   */
  static async getUserNotifications(userId, query = {}) {
    const options = {
      unreadOnly: query.unreadOnly === 'true',
      status: query.status || 'all',
      category: query.category || 'all',
      page: Math.max(1, parseInt(query.page, 10) || 1),
      limit: Math.min(Math.max(1, parseInt(query.limit, 10) || 20), 80),
    };

    const data = await NotificationRepository.getUserNotifications(userId, options);

    return {
      success: true,
      ...data,
    };
  }

  /**
   * Handle bulk actions (mark_all_read)
   */
  static async bulkAction(userId, action) {
    if (action === 'mark_all_read') {
      const result = await NotificationRepository.markAllAsRead(userId);
      return { success: true, ...result };
    }

    throw Object.assign(new Error('Unsupported action'), { statusCode: 422 });
  }

  /**
   * Bulk delete notifications
   */
  static async bulkDelete(userId, scope = 'read') {
    if (!['read', 'all'].includes(scope)) {
      throw Object.assign(new Error('Unsupported delete scope'), { statusCode: 422 });
    }

    const result = await NotificationRepository.deleteNotifications(userId, scope);
    return { success: true, ...result };
  }

  /**
   * Mark single notification as read
   */
  static async markAsRead(userId, notificationId) {
    const notification = await NotificationRepository.markAsRead(notificationId, userId);

    if (!notification) {
      throw Object.assign(new Error('Notification not found'), { statusCode: 404 });
    }

    return { notification };
  }

  /**
   * Delete single notification
   */
  static async deleteOne(userId, notificationId) {
    const notification = await NotificationRepository.deleteOne(notificationId, userId);

    if (!notification) {
      throw Object.assign(new Error('Notification not found'), { statusCode: 404 });
    }

    return { message: 'Notification deleted' };
  }

  /**
   * Create notification helper
   */
  static async createNotification(data) {
    return NotificationRepository.create(data);
  }

  /**
   * Create notifications for multiple users (e.g., when a supplier responds to RFQ)
   */
  static async notifyUsers(userIds, data) {
    return NotificationRepository.createForUsers(userIds, data);
  }

  /**
   * Get unread count for header badge
   */
  static async getUnreadCount(userId) {
    const { unreadCount } = await NotificationRepository.getUserNotifications(userId, { limit: 1 });
    return { unreadCount };
  }
}

export default NotificationService;