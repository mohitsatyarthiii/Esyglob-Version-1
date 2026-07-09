import CustomsService from '../services/customs.service.js';

class CustomsController {
  /**
   * GET - List customs clearances
   */
  static async list(req, res) {
    try {
      const result = await CustomsService.listClearances(
        req.user._id, req.user.roles, req.query
      );
      return res.json(result);
    } catch (error) {
      console.error('[Customs-List] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch customs clearances' });
    }
  }

  /**
   * POST - Create customs clearance
   */
  static async create(req, res) {
    try {
      const result = await CustomsService.createClearance(req.user._id, req.body);
      return res.status(201).json(result);
    } catch (error) {
      console.error('[Customs-Create] Error:', error);
      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to create customs clearance request' });
    }
  }

  /**
   * GET - Single clearance detail
   */
  static async getById(req, res) {
    try {
      const { clearanceId } = req.params;
      const result = await CustomsService.getClearance(
        req.user._id, req.user.roles, clearanceId
      );
      return res.json(result);
    } catch (error) {
      console.error('[Customs-Get] Error:', error);
      if (error.statusCode === 404) return res.status(404).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to fetch customs clearance' });
    }
  }

  /**
   * PATCH - Update clearance
   */
  static async update(req, res) {
    try {
      const { clearanceId } = req.params;
      const result = await CustomsService.updateClearance(
        req.user._id, req.user.roles, clearanceId, req.body
      );
      return res.json(result);
    } catch (error) {
      console.error('[Customs-Update] Error:', error);
      if (error.statusCode === 400) return res.status(400).json({ error: error.message });
      if (error.statusCode === 404) return res.status(404).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to update customs clearance' });
    }
  }
}

export default CustomsController;