import SupportTicket from '../models/SupportTicket.js';
import mongoose from 'mongoose';

class SupportTicketRepository {
  /**
   * Get user's tickets
   */
  static async findByUser(userId, limit = 20) {
    return SupportTicket.find({ userId })
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 50))
      .lean();
  }

  static async findOwnedById(ticketId, userId) {
    if (!mongoose.Types.ObjectId.isValid(ticketId)) return null;
    return SupportTicket.findOne({ _id: ticketId, userId }).lean();
  }

  /**
   * Create support ticket
   */
  static async create(data) {
    return SupportTicket.create(data);
  }
}

export default SupportTicketRepository;
