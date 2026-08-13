import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Seller from '../models/Seller.js';
import mongoose from 'mongoose';

class SampleOrderRepository {
  /**
   * Find product for sample order
   */
  static async findProduct(productId) {
    if (!mongoose.Types.ObjectId.isValid(productId)) return null;

    return Product.findById(productId)
      .select('sellerId userId name images price samplePrice currency unit minimumOrderQuantity directOrderEnabled orderType status category subcategory countryOfOrigin hsCode packaging')
      .lean();
  }

  /**
   * Find seller for order
   */
  static async findSeller(sellerId) {
    if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) return null;

    return Seller.findById(sellerId)
      .select('userId companyName address shippingAddress businessEmail businessPhone gstNumber isVerified isTrustedSeller')
      .lean();
  }

  /**
   * Generate order number
   */
  static async generateOrderNumber(prefix = 'SAM') {
    const count = await Order.countDocuments();
    return `${prefix}${String(count + 1).padStart(8, '0')}`;
  }

  /**
   * Create order
   */
  static async createOrder(orderData) {
    try { return await new Order(orderData).save(); }
    catch (error) {
      if (error.code === 11000 && orderData.checkout?.idempotencyKey) {
        const existing = await Order.findOne({ 'checkout.idempotencyKey': orderData.checkout.idempotencyKey });
        if (existing) return existing;
      }
      throw error;
    }
  }

  /**
   * Save order
   */
  static async saveOrder(order) {
    return order.save();
  }
}

export default SampleOrderRepository;
