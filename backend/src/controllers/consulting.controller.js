import ConsultingService from '../services/consulting.service.js';

class ConsultingController {
  /**
   * GET - List consulting engagements
   */
  static async list(req, res) {
    try {
      const result = await ConsultingService.listEngagements(
        req.user._id, req.user.roles, req.query
      );
      return res.json(result);
    } catch (error) {
      console.error('[Consulting-List] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch consulting engagements' });
    }
  }

  /**
   * POST - Create consulting inquiry
   */
  static async create(req, res) {
    try {
      const result = await ConsultingService.createInquiry(req.user._id, req.body);
      return res.status(201).json(result);
    } catch (error) {
      console.error('[Consulting-Create] Error:', error);
      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to submit consulting inquiry' });
    }
  }
}

export default ConsultingController;