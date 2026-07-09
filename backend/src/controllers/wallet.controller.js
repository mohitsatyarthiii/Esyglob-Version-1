import WalletService from '../services/wallet.service.js';

class WalletController {
  /**
   * GET - Wallet summary/dashboard
   */
  static async getSummary(req, res) {
    try {
      const result = await WalletService.getWalletSummary(req.user, req.query.role);
      return res.json(result);
    } catch (error) {
      console.error('[Wallet-Summary] Error:', error);
      if (error.statusCode === 404) return res.status(404).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to load wallet' });
    }
  }

  /**
   * GET - Withdrawal history
   */
  static async getWithdrawals(req, res) {
    try {
      const result = await WalletService.getWithdrawals(req.user);
      return res.json(result);
    } catch (error) {
      console.error('[Wallet-Withdrawals] Error:', error);
      if (error.statusCode === 403) return res.status(403).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to load withdrawals' });
    }
  }

  /**
   * POST - Create withdrawal request
   */
  static async createWithdrawal(req, res) {
    try {
      const result = await WalletService.createWithdrawal(req.user, req.body);
      return res.status(201).json(result);
    } catch (error) {
      console.error('[Wallet-CreateWithdrawal] Error:', error);
      if (error.statusCode === 400) return res.status(400).json({ error: error.message });
      if (error.statusCode === 403) return res.status(403).json({ error: error.message });
      if (error.statusCode === 404) return res.status(404).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to request withdrawal' });
    }
  }

  /**
   * GET - Payment methods
   */
  static async getPaymentMethods(req, res) {
    try {
      const result = await WalletService.getPaymentMethods(req.user, req.query.role);
      return res.json(result);
    } catch (error) {
      console.error('[Wallet-Methods] Error:', error);
      return res.status(500).json({ error: 'Failed to load payment methods' });
    }
  }

  /**
   * POST - Add payment method
   */
  static async addPaymentMethod(req, res) {
    try {
      const result = await WalletService.addPaymentMethod(req.user, req.body);
      return res.status(201).json(result);
    } catch (error) {
      console.error('[Wallet-AddMethod] Error:', error);
      if (error.statusCode === 400) return res.status(400).json({ error: error.message });
      return res.status(500).json({ error: error.message || 'Failed to save payment method' });
    }
  }
}

export default WalletController;