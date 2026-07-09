import DisputeService from '../services/dispute.service.js';

class DisputeController {
  /**
   * GET - List disputes
   */
  static async list(req, res) {
    try {
      const result = await DisputeService.listDisputes(
        req.user._id, req.user.roles, req.query
      );
      return res.json(result);
    } catch (error) {
      console.error('[Disputes-List] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch disputes' });
    }
  }

  /**
   * POST - File dispute
   */
  static async create(req, res) {
    try {
      const result = await DisputeService.createDispute(req.user._id, req.body);
      return res.status(201).json(result);
    } catch (error) {
      console.error('[Disputes-Create] Error:', error);

      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      if (error.statusCode === 409) {
        return res.status(409).json({
          error: error.message,
          disputeId: error.disputeId,
        });
      }

      return res.status(500).json({ error: 'Failed to file dispute' });
    }
  }

  /**
   * GET - Single dispute detail
   */
  static async getById(req, res) {
    try {
      const { disputeId } = req.params;
      const result = await DisputeService.getDispute(
        { ...req.user, roles: req.user.roles, userId: req.user._id },
        disputeId
      );
      return res.json(result);
    } catch (error) {
      console.error('[Disputes-Get] Error:', error);
      if (error.statusCode === 404) return res.status(404).json({ error: error.message });
      if (error.statusCode === 403) return res.status(403).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to fetch dispute' });
    }
  }

  /**
   * PATCH - Update dispute (message/status)
   */
  static async update(req, res) {
    try {
      const { disputeId } = req.params;
      const result = await DisputeService.updateDispute(
        { ...req.user, roles: req.user.roles, userId: req.user._id },
        disputeId,
        req.body
      );
      return res.json(result);
    } catch (error) {
      console.error('[Disputes-Update] Error:', error);
      if (error.statusCode === 400) return res.status(400).json({ error: error.message });
      if (error.statusCode === 404) return res.status(404).json({ error: error.message });
      if (error.statusCode === 403) return res.status(403).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to update dispute' });
    }
  }
}

export default DisputeController;