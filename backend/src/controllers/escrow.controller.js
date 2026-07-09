import EscrowService from '../services/escrow.service.js';

class EscrowController {
  /**
   * GET - List escrow transactions
   */
  static async list(req, res) {
    try {
      const result = await EscrowService.listTransactions(req.user._id, req.query);
      return res.json(result);
    } catch (error) {
      console.error('[Escrow-List] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch escrow transactions' });
    }
  }

  /**
   * POST - Create escrow agreement
   */
  static async create(req, res) {
    try {
      const result = await EscrowService.createEscrow(req.user._id, req.body);
      return res.status(201).json(result);
    } catch (error) {
      console.error('[Escrow-Create] Error:', error);

      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }
      if (error.statusCode === 409) {
        return res.status(409).json({
          error: error.message,
          escrowId: error.escrowId,
        });
      }

      return res.status(500).json({ error: 'Failed to create escrow transaction' });
    }
  }

  /**
   * GET - Single escrow detail
   */
  static async getById(req, res) {
    try {
      const { transactionId } = req.params;
      const result = await EscrowService.getEscrow(
        { ...req.user, roles: req.user.roles, userId: req.user._id },
        transactionId
      );
      return res.json(result);
    } catch (error) {
      console.error('[Escrow-Get] Error:', error);
      if (error.statusCode === 404) return res.status(404).json({ error: error.message });
      if (error.statusCode === 403) return res.status(403).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to fetch escrow transaction' });
    }
  }

  /**
   * PATCH - Update escrow (deposit/approve/dispute)
   */
  static async update(req, res) {
    try {
      const { transactionId } = req.params;
      const result = await EscrowService.updateEscrow(
        { ...req.user, roles: req.user.roles, userId: req.user._id },
        transactionId,
        req.body
      );
      return res.json(result);
    } catch (error) {
      console.error('[Escrow-Update] Error:', error);
      if (error.statusCode === 400) return res.status(400).json({ error: error.message });
      if (error.statusCode === 404) return res.status(404).json({ error: error.message });
      if (error.statusCode === 403) return res.status(403).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to update escrow transaction' });
    }
  }
}

export default EscrowController;