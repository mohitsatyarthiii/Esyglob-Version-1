import Invoice from '../models/Invoice.js';
import Seller from '../models/Seller.js';

class InvoiceRepository {
  /**
   * Find seller by userId
   */
  static async findSellerByUserId(userId) {
    return Seller.findOne({ userId }).select('_id').lean();
  }

  /**
   * Find invoices with query
   */
  static async findInvoices(query) {
    return Invoice.find(query)
      .populate('orderId', 'orderNumber status')
      .sort({ createdAt: -1 })
      .lean();
  }
}

export default InvoiceRepository;