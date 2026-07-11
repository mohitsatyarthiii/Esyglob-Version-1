import { Server } from 'socket.io';
import { verifyToken } from './crypto.js';
import { setIO } from './socket.js';
import User from '../models/User.js';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import { config } from '../config/env.js';

function id(value) {
  return String(value?._id || value?.id || value || '');
}

export function initializeSocket(server) {
  const io = new Server(server, {
    cors: { origin: config.corsOrigin === true ? true : config.corsOrigin, credentials: true },
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.use(async (socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token || '').trim();
      const payload = verifyToken(token);
      if (!payload?.sub) return next(new Error('Unauthorized'));
      const user = await User.findById(payload.sub).select('_id roles isActive isBanned').lean();
      if (!user?.isActive || user.isBanned) return next(new Error('Unauthorized'));
      socket.data.userId = id(user);
      socket.data.roles = user.roles || [];
      return next();
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', socket => {
    const userId = socket.data.userId;
    socket.join(`user_${userId}`);
    io.emit('presence_updated', { userId, online: true, at: new Date().toISOString() });

    socket.on('join_chat', async ({ chatId } = {}, acknowledge = () => {}) => {
      try {
        const chat = await Chat.findById(chatId).select('buyerId sellerId groupMembers').lean();
        const allowed = chat && [chat.buyerId, chat.sellerId, ...(chat.groupMembers || [])].some(value => id(value) === userId);
        if (!allowed) return acknowledge({ ok: false, error: 'Forbidden' });
        await socket.join(`chat_${chatId}`);
        return acknowledge({ ok: true });
      } catch {
        return acknowledge({ ok: false, error: 'Unable to join chat' });
      }
    });

    socket.on('leave_chat', ({ chatId } = {}) => chatId && socket.leave(`chat_${chatId}`));
    socket.on('typing', ({ chatId, typing } = {}) => {
      if (chatId && socket.rooms.has(`chat_${chatId}`)) {
        socket.to(`chat_${chatId}`).emit('typing_updated', { chatId, userId, typing: Boolean(typing) });
      }
    });
    socket.on('mark_read', async ({ chatId } = {}) => {
      if (!chatId || !socket.rooms.has(`chat_${chatId}`)) return;
      await Message.updateMany({ chatId, senderId: { $ne: userId }, isRead: { $ne: true } }, { $set: { isRead: true, readAt: new Date() } });
      socket.to(`chat_${chatId}`).emit('messages_read', { chatId, userId, readAt: new Date().toISOString() });
    });

    socket.on('disconnect', async () => {
      const sockets = await io.in(`user_${userId}`).fetchSockets();
      if (sockets.length === 0) io.emit('presence_updated', { userId, online: false, at: new Date().toISOString() });
    });
  });

  setIO(io);
  return io;
}
