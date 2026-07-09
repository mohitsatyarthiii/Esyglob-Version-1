import SampleOrderService from '../services/sample-order.service.js';

class SampleOrderController {
  /**
   * POST - Create sample order
   */
  static async create(req, res) {
    try {
      const result = await SampleOrderService.createSampleOrder(req.user._id, req.body);
      return res.status(201).json(result);
    } catch (error) {
      console.error('[Sample-Order] Error:', error);

      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({
        error: 'Failed to create order',
        message: error.message,
      });
    }
  }
}

export default SampleOrderController;