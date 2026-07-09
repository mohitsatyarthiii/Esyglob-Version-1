import InvoiceRepository from '../repositories/invoice.repository.js';

class InvoiceService {
  /**
   * Get invoices for authenticated user
   */
  static async getInvoices(user) {
    const userId = user.id || user._id;
    const roles = user.roles || [];
    const isSeller = roles.includes('seller');
    const isAdmin = roles.includes('admin');

    // Build query based on role
    let query = {};

    if (isAdmin) {
      // Admin sees all invoices
      query = {};
    } else {
      // Build $or conditions
      const orConditions = [
        { buyerId: userId },
        { sellerUserId: userId },
      ];

      // Add seller-specific condition if applicable
      if (isSeller) {
        const seller = await InvoiceRepository.findSellerByUserId(userId);
        if (seller?._id) {
          orConditions.push({ sellerId: seller._id });
        }
      }

      query = { $or: orConditions };
    }

    const invoices = await InvoiceRepository.findInvoices(query);
    return { invoices };
  }
}

export default InvoiceService;