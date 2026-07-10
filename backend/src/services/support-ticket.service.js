import SupportTicketRepository from '../repositories/support-ticket.repository.js';
import { ticketSchema } from '../validators/support-ticket.validator.js';
import { z } from 'zod';

class SupportTicketService {
  /**
   * Get user's support tickets
   */
  static async getUserTickets(userId, query = {}) {
    const limit = Math.min(
      Math.max(parseInt(query.limit, 10) || 20, 1),
      50
    );

    const tickets = await SupportTicketRepository.findByUser(userId, limit);
    return { tickets };
  }

  static async getUserTicket(userId, ticketId) {
    const request = await SupportTicketRepository.findOwnedById(ticketId, userId);
    if (!request) {
      throw Object.assign(new Error('Support ticket not found'), { statusCode: 404 });
    }
    return { request };
  }

  /**
   * Create support ticket
   */
  static async createTicket(userId, user, data) {
    // Validate
    const parsed = ticketSchema.parse(data);

    // Create ticket
    const ticket = await SupportTicketRepository.create({
      ...parsed,
      userId,
      roleContext:
        parsed.roleContext === 'general'
          ? user.primaryRole || 'general'
          : parsed.roleContext,
      source: 'ai_support',
    });

    return { ticket };
  }
}

export default SupportTicketService;
