import * as chatService from '../services/chat.service.js';
import { toPositiveInt, isObjectId } from '../lib/chat-helpers.js';
import { z } from 'zod';
import mongoose from 'mongoose';

const groupSchema = z.object({
  groupName: z.string().trim().min(2).max(80),
  memberIds: z
    .array(z.string().refine((id) => mongoose.Types.ObjectId.isValid(id)))
    .min(1)
    .max(20),
  role: z.enum(['buyer', 'seller']).optional(),
});

// ─── GET /api/chat (Chat List) ─────────────────────────────
export async function getChatList(req, res, next) {
  try {
    const session = await getSession(req);
    if (!session?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { rfqId, role, view, unreadOnly, label, limit } = req.query;

    const result = await chatService.getChatList(session, {
      rfqId,
      role,
      view: view || 'active',
      unreadOnly: unreadOnly === 'true',
      label,
      limit: toPositiveInt(limit, 30, 60),
    });

    res.set('Cache-Control', 'private, no-store');
    return res.json({ success: true, chats: result.chats });
  } catch (error) {
    console.error('Chat list error:', error);
    return res.status(500).json({ error: 'Failed to fetch chats' });
  }
}

// ─── POST /api/chat (Create Chat) ──────────────────────────
export async function createChat(req, res, next) {
  try {
    const session = await getSession(req);
    if (!session?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await chatService.createChat(session, req.body);

    return res.json({ success: true, chat: result.chat, created: result.created });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Create chat error:', error);
    return res.status(500).json({ error: 'Failed to create chat' });
  }
}

// ─── GET /api/chat/:chatId (Get Messages) ──────────────────
export async function getChatMessages(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { chatId } = req.params;

    if (!isObjectId(chatId)) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const limit = toPositiveInt(req.query.limit, 30, 60);
    const before = req.query.before;
    const after = req.query.after;
    const markRead = req.query.markRead !== 'false' && !after;

    const result = await chatService.getChatMessages(user, chatId, {
      limit,
      before,
      after,
      markRead,
    });

    return res.json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Chat messages error:', error);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
}

// ─── POST /api/chat/:chatId (Send Message) ─────────────────
export async function sendMessage(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { chatId } = req.params;

    if (!isObjectId(chatId)) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const result = await chatService.sendMessage(user, chatId, req.body);

    return res.json({
      success: true,
      message: result.message,
      autoReply: result.autoReply,
      autoReplies: result.autoReplies,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        contactInfoBlocked: error.contactInfoBlocked,
      });
    }
    console.error('Send message error:', error);
    return res.status(500).json({ error: 'Failed to send message' });
  }
}

// ─── PATCH /api/chat/:chatId (Chat Actions) ────────────────
export async function updateChat(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { chatId } = req.params;

    if (!isObjectId(chatId)) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const result = await chatService.performChatAction(user, chatId, req.body);

    return res.json({ success: true, chat: result.chat, message: result.message });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Chat action error:', error);
    return res.status(500).json({ error: 'Failed to update chat' });
  }
}

// ─── POST /api/chat/group (Create Group) ───────────────────
export async function createGroupChat(req, res, next) {
  try {
    const session = await getSession(req);
    if (!session?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const data = groupSchema.parse(req.body);
    const result = await chatService.createGroupChat(session, data);

    return res.status(201).json({ success: true, chat: result.chat });
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(422).json({ error: 'Enter a group name and select contacts' });
    }
    console.error('Group chat creation error:', error);
    return res.status(500).json({ error: 'Unable to create group chat' });
  }
}

// Helper to get session for chat list/create endpoints
async function getSession(req) {
  const { getSession } = await import('../lib/session.js');
  return getSession(req);
}