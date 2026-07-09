import ShippingService from '../services/shipping.service.js';

class ShippingController {
  /**
   * GET - List shipping orders
   */
  static async list(req, res) {
    try {
      const result = await ShippingService.listShipments(
        req.user._id, req.user.roles, req.query
      );
      return res.json(result);
    } catch (error) {
      console.error('[Shipping-List] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch shipments' });
    }
  }

  /**
   * POST - Create shipping order
   */
  static async create(req, res) {
    try {
      const result = await ShippingService.createShipment(req.user._id, req.body);
      return res.status(201).json(result);
    } catch (error) {
      console.error('[Shipping-Create] Error:', error);
      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to create shipment' });
    }
  }

  /**
   * GET - Single shipment detail
   */
  static async getById(req, res) {
    try {
      const { shipmentId } = req.params;
      const result = await ShippingService.getShipment(
        req.user._id, req.user.roles, shipmentId
      );
      return res.json(result);
    } catch (error) {
      console.error('[Shipping-Get] Error:', error);
      if (error.statusCode === 404) return res.status(404).json({ error: error.message });
      if (error.statusCode === 403) return res.status(403).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to fetch shipment' });
    }
  }

  /**
   * PATCH - Book or cancel shipment
   */
  static async performAction(req, res) {
    try {
      const { shipmentId } = req.params;
      const result = await ShippingService.performAction(
        req.user._id, req.user.roles, shipmentId, req.body
      );
      return res.json(result);
    } catch (error) {
      console.error('[Shipping-Action] Error:', error);
      if (error.statusCode === 400) return res.status(400).json({ error: error.message });
      if (error.statusCode === 404) return res.status(404).json({ error: error.message });
      if (error.statusCode === 403) return res.status(403).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to update shipment' });
    }
  }
}

export default ShippingController;