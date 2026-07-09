import ShipmentService from '../services/shipment.service.js';

class ShipmentController {
  /**
   * GET - List shipments
   */
  static async list(req, res) {
    try {
      const result = await ShipmentService.getShipments(req.user._id);
      return res.json(result);
    } catch (error) {
      console.error('[Shipments-GET] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch shipments' });
    }
  }

  /**
   * POST - Create shipment
   */
  static async create(req, res) {
    try {
      if (!req.user?.roles?.includes('seller')) {
        return res.status(403).json({ error: 'Seller access required' });
      }

      const result = await ShipmentService.createShipment(
        req.user._id, req.user.roles, req.body
      );
      return res.status(201).json(result);
    } catch (error) {
      console.error('[Shipments-POST] Error:', error);

      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }
      if (error.statusCode === 409) {
        return res.status(409).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Failed to create shipment' });
    }
  }
}

export default ShipmentController;