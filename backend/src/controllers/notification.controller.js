import NotificationService from '../services/notification.service.js';

class NotificationController {
  /**
   * GET - List notifications
   */
  static async list(req, res) {
    try {
      const result = await NotificationService.getUserNotifications(req.user._id, req.query);
      return res.json(result);
    } catch (error) {
      console.error('[Notifications-GET] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  }

  /**
   * GET - Unread count only
   */
  static async unreadCount(req, res) {
    try {
      const result = await NotificationService.getUnreadCount(req.user._id);
      return res.json(result);
    } catch (error) {
      console.error('[Notifications-Count] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch unread count' });
    }
  }

  /**
   * PATCH - Bulk action (mark all read)
   */
  static async bulkAction(req, res) {
    try {
      const { action } = req.body;
      const result = await NotificationService.bulkAction(req.user._id, action);
      return res.json(result);
    } catch (error) {
      console.error('[Notifications-Bulk] Error:', error);
      if (error.statusCode === 422) {
        return res.status(422).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to update notifications' });
    }
  }

  /**
   * DELETE - Bulk delete
   */
  static async bulkDelete(req, res) {
    try {
      const { scope } = req.query;
      const result = await NotificationService.bulkDelete(req.user._id, scope || 'read');
      return res.json(result);
    } catch (error) {
      console.error('[Notifications-Bulk-Delete] Error:', error);
      if (error.statusCode === 422) {
        return res.status(422).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to delete notifications' });
    }
  }

  /**
   * PATCH - Mark single notification as read
   */
  static async markAsRead(req, res) {
    try {
      const { notificationId } = req.params;
      const result = await NotificationService.markAsRead(req.user._id, notificationId);
      return res.json(result);
    } catch (error) {
      console.error('[Notification-MarkRead] Error:', error);
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to update notification' });
    }
  }

  /**
   * DELETE - Delete single notification
   */
  static async deleteOne(req, res) {
    try {
      const { notificationId } = req.params;
      const result = await NotificationService.deleteOne(req.user._id, notificationId);
      return res.json(result);
    } catch (error) {
      console.error('[Notification-Delete] Error:', error);
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to delete notification' });
    }
  }
}

export default NotificationController;