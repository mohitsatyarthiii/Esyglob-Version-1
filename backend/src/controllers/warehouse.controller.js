import WarehouseService from '../services/warehouse.service.js';

class WarehouseController {
  /**
   * GET - Get warehousing data
   */
  static async getData(req, res) {
    try {
      const result = await WarehouseService.getData(req.user._id, req.query);
      return res.json(result);
    } catch (error) {
      console.error('[Warehouse-GET] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch warehousing data' });
    }
  }

  /**
   * POST - Process warehouse operation
   */
  static async processOperation(req, res) {
    try {
      const result = await WarehouseService.processOperation(
        req.user._id, req.body
      );
      return res.status(201).json(result);
    } catch (error) {
      console.error('[Warehouse-POST] Error:', error);

      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Failed to process warehousing operation' });
    }
  }
}

export default WarehouseController;