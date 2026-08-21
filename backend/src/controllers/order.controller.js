import OrderService from '../services/order.service.js';
import OrderTrackingService from '../services/order-tracking.service.js';

class OrderController {
  static async getTracking(req, res) {
    try {
      return res.json(await OrderTrackingService.get(req.user._id, req.user.roles, req.params.orderId, { refresh: req.query.refresh === 'true' || req.query.refresh === '1' }));
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.statusCode >= 500 ? 'Tracking is temporarily unavailable' : error.message, code: error.code });
    }
  }
  static async markReadyForShipment(req, res) {
    try { return res.json(await OrderTrackingService.markReady(req.user._id, req.user.roles, req.params.orderId)); }
    catch (error) { return res.status(error.statusCode || 500).json({ error: error.statusCode >= 500 ? 'Shipment booking is taking longer than expected. Please retry shortly.' : error.message, code: error.code, details: error.details }); }
  }
  static async createTrackingQuery(req, res) {
    try { return res.status(201).json(await OrderTrackingService.createQuery(req.user._id, req.user.roles, req.params.orderId, req.body)); }
    catch (error) { return res.status(error.statusCode || 500).json({ error: error.statusCode >= 500 ? 'Your query could not be submitted. Please retry.' : error.message, code: error.code }); }
  }
  static async retryShippingBooking(req,res){try{return res.json(await OrderService.retryShippingBooking(req.user._id,req.user.roles,req.params.orderId));}catch(error){return res.status(error.statusCode||500).json({error:error.message});}}
  static async sellerQueue(req,res){try{return res.json(await OrderService.sellerQueue(req.user._id,req.query));}catch(error){return res.status(error.statusCode||500).json({error:error.message});}}
  static async startOrder(req,res){try{return res.status(201).json(await OrderService.startOrder(req.user._id,req.body));}catch(error){return res.status(error.statusCode||500).json({error:error.message});}}
  static async buyerAction(req,res){try{return res.json(await OrderService.buyerAction(req.user._id,req.params.orderId,req.body));}catch(error){return res.status(error.statusCode||500).json({error:error.message});}}
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

      if (error.statusCode === 409 || error.statusCode === 422 || error.statusCode === 502 || error.statusCode === 503) {
        return res.status(error.statusCode).json({ error: error.message });
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
