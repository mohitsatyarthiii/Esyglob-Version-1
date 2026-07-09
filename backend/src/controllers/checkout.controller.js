import * as checkoutService from '../services/checkout.service.js';

export async function getCheckoutQuote(req, res, next) {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await checkoutService.getCheckoutQuote(user, req.body);

    return res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Checkout quote error:', error);
    return res.status(500).json({ error: 'Failed to build checkout quote' });
  }
}