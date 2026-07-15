import { Router } from 'express';
import AIChatController from '../controllers/ai-chat.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';
import { requireSubscriptionFeature } from '../lib/subscription-access.js';

const router = Router();

// All AI chat routes require authentication
router.use(authenticate);
router.use(requireAuth);

// GET - Fetch AI chats or single chat
router.get('/', AIChatController.getChats);

// GET - AI service status
router.get('/status', AIChatController.getStatus);

// POST - Send message (non-streaming)
router.post('/', requireSubscriptionFeature('aiRequests',{ai:true,aiFeature:'chat'}), AIChatController.sendMessage);

// POST - Stream chat (SSE)
router.post('/stream', requireSubscriptionFeature('aiRequests',{ai:true,aiFeature:'chat'}), AIChatController.streamChat);

// PATCH - Update chat
router.patch('/', AIChatController.updateChat);

// DELETE - Archive chat
router.delete('/', AIChatController.archiveChat);

export default router;
