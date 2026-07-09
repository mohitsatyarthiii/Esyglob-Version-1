import FinancingService from '../services/financing.service.js';

class FinancingController {
  /**
   * GET - List financing applications
   */
  static async list(req, res) {
    try {
      const result = await FinancingService.listApplications(
        req.user._id, req.user.roles, req.query
      );
      return res.json(result);
    } catch (error) {
      console.error('[Financing-List] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch financing applications' });
    }
  }

  /**
   * POST - Create financing application
   */
  static async create(req, res) {
    try {
      const result = await FinancingService.createApplication(req.user._id, req.body);
      return res.status(201).json(result);
    } catch (error) {
      console.error('[Financing-Create] Error:', error);
      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to submit financing application' });
    }
  }

  /**
   * GET - Single application detail
   */
  static async getById(req, res) {
    try {
      const { applicationId } = req.params;
      const result = await FinancingService.getApplication(
        req.user._id, req.user.roles, applicationId
      );
      return res.json(result);
    } catch (error) {
      console.error('[Financing-Get] Error:', error);
      if (error.statusCode === 404) return res.status(404).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to fetch financing application' });
    }
  }

  /**
   * PATCH - Update application
   */
  static async update(req, res) {
    try {
      const { applicationId } = req.params;
      const result = await FinancingService.updateApplication(
        req.user._id, req.user.roles, applicationId, req.body
      );
      return res.json(result);
    } catch (error) {
      console.error('[Financing-Update] Error:', error);
      if (error.statusCode === 400) return res.status(400).json({ error: error.message });
      if (error.statusCode === 404) return res.status(404).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to update financing application' });
    }
  }
}

export default FinancingController;