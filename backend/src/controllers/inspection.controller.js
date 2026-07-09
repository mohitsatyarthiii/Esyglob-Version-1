import InspectionService from '../services/inspection.service.js';

class InspectionController {
  /**
   * GET - List inspections
   */
  static async list(req, res) {
    try {
      const result = await InspectionService.listInspections(
        req.user._id, req.user.roles, req.query
      );
      return res.json(result);
    } catch (error) {
      console.error('[Inspections-List] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch inspections' });
    }
  }

  /**
   * POST - Create inspection
   */
  static async create(req, res) {
    try {
      const result = await InspectionService.createInspection(req.user._id, req.body);
      return res.status(201).json(result);
    } catch (error) {
      console.error('[Inspections-Create] Error:', error);
      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to create inspection' });
    }
  }

  /**
   * GET - Single inspection detail
   */
  static async getById(req, res) {
    try {
      const { inspectionId } = req.params;
      const result = await InspectionService.getInspection(
        req.user._id, req.user.roles, inspectionId
      );
      return res.json(result);
    } catch (error) {
      console.error('[Inspections-Get] Error:', error);
      if (error.statusCode === 404) return res.status(404).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to fetch inspection' });
    }
  }

  /**
   * PATCH - Update inspection
   */
  static async update(req, res) {
    try {
      const { inspectionId } = req.params;
      const result = await InspectionService.updateInspection(
        req.user._id, req.user.roles, inspectionId, req.body
      );
      return res.json(result);
    } catch (error) {
      console.error('[Inspections-Update] Error:', error);
      if (error.statusCode === 400) return res.status(400).json({ error: error.message });
      if (error.statusCode === 404) return res.status(404).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to update inspection' });
    }
  }
}

export default InspectionController;