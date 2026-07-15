import InvoiceService from '../services/invoice.service.js';
import Invoice from '../models/Invoice.js';
import { streamServiceInvoicePdf } from '../lib/service-invoice-pdf.js';

class InvoiceController {
  /**
   * GET - List invoices
   */
  static async list(req, res) {
    try {
      const result = await InvoiceService.getInvoices(req.user);
      const origin = `${req.protocol}://${req.get('host')}`;
      return res.json({ ...result, invoices: result.invoices.map(invoice => ({ ...invoice, documentUrl: invoice.documentUrl?.startsWith('/') ? `${origin}${invoice.documentUrl}` : invoice.documentUrl })) });
    } catch (error) {
      console.error('[Invoices-GET] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch invoices' });
    }
  }

  static async publicPdf(req, res) {
    try {
      const invoice = await Invoice.findOne({ downloadToken: req.params.token }).lean();
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      return streamServiceInvoicePdf(invoice, res);
    } catch (error) {
      console.error('[Invoice-PDF] Error:', error);
      return res.status(500).json({ error: 'Invoice PDF could not be generated' });
    }
  }
}

export default InvoiceController;
