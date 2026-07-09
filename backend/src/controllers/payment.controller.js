import PaymentService from '../services/payment.service.js';

class PaymentController {
  /**
   * GET - Get payment by ID
   */
  static async getById(req, res) {
    try {
      const { paymentId } = req.params;
      const payment = await PaymentService.getPayment(paymentId, req.user._id);
      return res.json(payment);
    } catch (error) {
      console.error('[Payment-Get] Error:', error);
      if (error.statusCode === 404) return res.status(404).json({ error: error.message });
      if (error.statusCode === 403) return res.status(403).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to fetch payment' });
    }
  }

  /**
   * POST - Initiate order payment
   */
  static async initiate(req, res) {
    try {
      const { orderId } = req.body;
      const result = await PaymentService.initiateOrderPayment(req.user._id, orderId);
      return res.json(result);
    } catch (error) {
      console.error('[Payment-Initiate] Error:', error);
      if (error.statusCode === 400) return res.status(400).json({ error: error.message });
      if (error.statusCode === 403) return res.status(403).json({ error: error.message });
      if (error.statusCode === 404) return res.status(404).json({ error: error.message });
      if (error.statusCode === 503) return res.status(503).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to create payment order', message: error.message });
    }
  }

  /**
   * POST - Verify order payment
   */
  static async verifyOrder(req, res) {
    try {
      const result = await PaymentService.verifyOrderPayment(req.user._id, req.body);
      return res.json(result);
    } catch (error) {
      console.error('[Payment-VerifyOrder] Error:', error);
      if (error.statusCode === 400) return res.status(400).json({ error: error.message });
      if (error.statusCode === 403) return res.status(403).json({ error: error.message });
      if (error.statusCode === 404) return res.status(404).json({ error: error.message });
      if (error.statusCode === 503) return res.status(503).json({ error: error.message });
      return res.status(500).json({ error: 'Payment verification failed' });
    }
  }

  /**
   * POST - Verify subscription payment
   */
  static async verifySubscription(req, res) {
    try {
      const result = await PaymentService.verifySubscriptionPayment(req.user._id, req.body);
      return res.json(result);
    } catch (error) {
      console.error('[Payment-VerifySub] Error:', error);
      if (error.statusCode === 400) return res.status(400).json({ error: error.message });
      if (error.statusCode === 503) return res.status(503).json({ error: error.message });
      return res.status(500).json({ error: 'Payment verification failed' });
    }
  }
}

export default PaymentController;