import { Router } from 'express';
import NotificationController from '../controllers/notification.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(requireAuth);

// GET - List notifications (with filters & pagination)
router.get('/', NotificationController.list);

// GET - Unread count only
router.get('/unread-count', NotificationController.unreadCount);

// PATCH - Bulk action (mark all read)
router.patch('/bulk', NotificationController.bulkAction);

// DELETE - Bulk delete
router.delete('/bulk', NotificationController.bulkDelete);

// PATCH - Mark single notification as read
router.patch('/:notificationId', NotificationController.markAsRead);

// DELETE - Delete single notification
router.delete('/:notificationId', NotificationController.deleteOne);

export default router;