import InvoiceService from '../services/invoice.service.js';

class InvoiceController {
  /**
   * GET - List invoices
   */
  static async list(req, res) {
    try {
      const result = await InvoiceService.getInvoices(req.user);
      return res.json(result);
    } catch (error) {
      console.error('[Invoices-GET] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch invoices' });
    }
  }
}

export default InvoiceController;