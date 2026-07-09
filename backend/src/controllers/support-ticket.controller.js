import SupportTicketService from '../services/support-ticket.service.js';
import { z } from 'zod';

class SupportTicketController {
  /**
   * GET - List support tickets
   */
  static async list(req, res) {
    try {
      const result = await SupportTicketService.getUserTickets(
        req.user._id, req.query
      );
      return res.json(result);
    } catch (error) {
      console.error('[SupportTicket-GET] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch support tickets' });
    }
  }

  /**
   * POST - Create support ticket
   */
  static async create(req, res) {
    try {
      const result = await SupportTicketService.createTicket(
        req.user._id, req.user, req.body
      );
      return res.status(201).json(result);
    } catch (error) {
      console.error('[SupportTicket-POST] Error:', error);

      if (error instanceof z.ZodError) {
        return res.status(422).json({ error: 'Please describe the support issue clearly' });
      }

      return res.status(500).json({ error: 'Failed to create support ticket' });
    }
  }
}

export default SupportTicketController;