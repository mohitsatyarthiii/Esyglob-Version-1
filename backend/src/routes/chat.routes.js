import { Router } from 'express';
import * as chatController from '../controllers/chat.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// GET /api/chat - Chat list
router.get('/', authenticate, requireAuth, chatController.getChatList);

// POST /api/chat - Create chat
router.post('/', authenticate, requireAuth, chatController.createChat);

// POST /api/chat/group - Create group chat
router.post('/group', authenticate, requireAuth, chatController.createGroupChat);
router.post('/groups', authenticate, requireAuth, chatController.createGroupChat);

// GET /api/chat/:chatId - Get messages
router.get('/:chatId', authenticate, requireAuth, chatController.getChatMessages);

// POST /api/chat/:chatId - Send message
router.post('/:chatId', authenticate, requireAuth, chatController.sendMessage);

// PATCH /api/chat/:chatId - Chat actions
router.patch('/:chatId', authenticate, requireAuth, chatController.updateChat);

export default router;
