import PaymentService from '../services/payment.service.js';
import crypto from 'crypto';

class PaymentController {
  static async webhook(req, res) {
    try {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
      if (!secret) return res.status(503).json({ error: 'Webhook is not configured' });
      const received = String(req.get('x-razorpay-signature') || '');
      const expected = crypto
        .createHmac('sha256', secret)
        .update(req.rawBody || Buffer.from(''))
        .digest('hex');
      const valid = received.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
      if (!valid) return res.status(401).json({ error: 'Invalid webhook signature' });

      const event = req.body?.event;
      const entity = req.body?.payload?.payment?.entity;
      if (event === 'payment.captured' || event === 'order.paid') {
        await PaymentService.processCapturedWebhook(entity);
      } else if (event === 'payment.failed') {
        await PaymentService.processFailedWebhook(entity);
      }
      return res.json({ received: true });
    } catch (error) {
      console.error('[Payment-Webhook] Error:', error);
      return res.status(error.statusCode || 500).json({ error: error.message || 'Webhook processing failed' });
    }
  }
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
      if (error.statusCode === 502) return res.status(502).json({ error: error.message });
      if (error.statusCode === 409) return res.status(409).json({ error: error.message });
      if (error.statusCode === 422) return res.status(422).json({ error: error.message });
      if (error.statusCode === 502) return res.status(502).json({ error: error.message });
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
      if (error.statusCode === 403) return res.status(403).json({ error: error.message });
      if (error.statusCode === 503) return res.status(503).json({ error: error.message });
      if (error.statusCode === 502) return res.status(502).json({ error: error.message });
      return res.status(500).json({ error: 'Payment verification failed' });
    }
  }
}

export default PaymentController;
