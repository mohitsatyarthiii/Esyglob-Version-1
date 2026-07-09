import SubscriptionService from '../services/subscription.service.js';

class SubscriptionController {
  /**
   * GET - Get subscription
   */
  static async get(req, res) {
    try {
      const result = await SubscriptionService.getSubscription(req.user);
      return res.json(result);
    } catch (error) {
      console.error('[Subscription-GET] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch subscription' });
    }
  }

  /**
   * POST - Create subscription order
   */
  static async createOrder(req, res) {
    try {
      const result = await SubscriptionService.createOrder(req.user, req.body);
      return res.json(result);
    } catch (error) {
      console.error('[Subscription-CreateOrder] Error:', error);

      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Failed to create subscription' });
    }
  }

  /**
   * PATCH - Toggle auto-renew
   */
  static async toggleAutoRenew(req, res) {
    try {
      const { autoRenew } = req.body;
      const result = await SubscriptionService.toggleAutoRenew(req.user, autoRenew);
      return res.json(result);
    } catch (error) {
      console.error('[Subscription-PATCH] Error:', error);

      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Failed to update auto-renew' });
    }
  }
}

export default SubscriptionController;