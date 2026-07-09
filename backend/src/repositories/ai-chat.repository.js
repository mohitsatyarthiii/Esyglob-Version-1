import AIChat from '../models/AIChat.js';
import SupportTicket from '../models/SupportTicket.js';

class AIChatRepository {
  /**
   * Find AI chat by ID
   */
  static async findById(chatId) {
    return AIChat.findById(chatId);
  }

  /**
   * Find AI chat by ID (lean - read only)
   */
  static async findByIdLean(chatId) {
    return AIChat.findById(chatId).lean();
  }

  /**
   * Find AI chat by ID and verify ownership
   */
  static async findByUserAndId(chatId, userId) {
    const chat = await AIChat.findById(chatId);
    if (!chat || chat.userId.toString() !== userId.toString()) return null;
    return chat;
  }

  /**
   * Get user's active AI chats list
   */
  static async findUserChats(userId, { role, status = 'active', limit = 30 } = {}) {
    const query = { userId, status };
    if (role && role !== 'general') query.roleContext = role;

    return AIChat.find(query)
      .select('_id title createdAt updatedAt lastMessageAt roleContext conversationType provider model totalMessages')
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Create new AI chat
   */
  static async createChat(data) {
    const chat = new AIChat(data);
    return chat.save();
  }

  /**
   * Save existing chat document
   */
  static async saveChat(chat) {
    return chat.save();
  }

  /**
   * Archive a chat (soft delete)
   */
  static async archiveChat(chatId, userId) {
    return AIChat.findOneAndUpdate(
      { _id: chatId, userId },
      { $set: { status: 'archived' } },
      { new: true }
    );
  }

  /**
   * Update chat with messages, provider, model, and context
   */
  static async updateChatAfterResponse(chatId, userId, updateData) {
    const {
      userMessage,
      assistantMessage,
      provider,
      model,
      tokensUsed,
      contextUpdates,
    } = updateData;

    const updateOps = {
      $push: {
        messages: {
          $each: [userMessage, assistantMessage].filter(Boolean),
        },
      },
      $inc: {
        totalMessages: (userMessage ? 1 : 0) + (assistantMessage ? 1 : 0),
        totalTokensUsed: tokensUsed || 0,
      },
      $set: {
        lastMessageAt: new Date(),
        ...(provider && { provider }),
        ...(model && { model }),
        ...(contextUpdates || {}),
      },
    };

    return AIChat.findOneAndUpdate(
      { _id: chatId, userId },
      updateOps,
      { new: true }
    );
  }

  /**
   * Create support ticket
   */
  static async createSupportTicket(data) {
    return SupportTicket.create(data);
  }
}

export default AIChatRepository;