import OrderService from '../services/order.service.js';

class OrderController {
  /**
   * GET - List orders
   */
  static async list(req, res) {
    try {
      const result = await OrderService.listOrders(req.user._id, req.query);
      return res.json(result);
    } catch (error) {
      console.error('[Orders-List] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch orders' });
    }
  }

  /**
   * POST - Create order
   */
  static async create(req, res) {
    try {
      const result = await OrderService.createOrder(req.user._id, req.body);
      return res.status(201).json(result);
    } catch (error) {
      console.error('[Orders-Create] Error:', error);

      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      if (error.statusCode === 403) {
        return res.status(403).json({ error: error.message });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: error.message || 'Failed to create order' });
    }
  }

  /**
   * GET - Single order detail
   */
  static async getById(req, res) {
    try {
      const { orderId } = req.params;
      const result = await OrderService.getOrder(req.user._id, req.user.roles, orderId);
      return res.json(result);
    } catch (error) {
      console.error('[Orders-Get] Error:', error);

      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }
      if (error.statusCode === 403) {
        return res.status(403).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Failed to fetch order' });
    }
  }

  /**
   * PATCH - Update order status
   */
  static async updateStatus(req, res) {
    try {
      const { orderId } = req.params;
      const result = await OrderService.updateOrderStatus(
        req.user._id, req.user.roles, orderId, req.body
      );
      return res.json(result);
    } catch (error) {
      console.error('[Orders-Update] Error:', error);

      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }
      if (error.statusCode === 403) {
        return res.status(403).json({ error: error.message });
      }
      if (error.statusCode === 409) {
        return res.status(409).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Failed to update order' });
    }
  }

  static async addProductionUpdate(req, res) {
    try {
      return res.json(await OrderService.addProductionUpdate(req.user._id, req.user.roles, req.params.orderId, req.body));
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to update production' });
    }
  }
}

export default OrderController;
