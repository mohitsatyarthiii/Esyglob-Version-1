import BuyerActivityRepository from '../repositories/buyer-activity.repository.js';
import mongoose from 'mongoose';

class BuyerActivityService {
  /**
   * Track recently viewed product
   */
  static async trackRecentlyViewed(userId, productId) {
    if (!productId) {
      throw Object.assign(new Error('productId is required'), { statusCode: 422 });
    }
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw Object.assign(new Error('Invalid product ID'), { statusCode: 422 });
    }

    await BuyerActivityRepository.trackRecentlyViewed(userId, productId);
    return { tracked: true };
  }

  /**
   * Get saved items or check if specific item is saved
   */
  static async getSavedItems(userId, query = {}) {
    const { type, itemId } = query;

    // Check if specific item is saved
    if (type && itemId) {
      if (!['product', 'supplier'].includes(type) || !mongoose.Types.ObjectId.isValid(itemId)) {
        return { saved: false, items: [] };
      }

      const target = await BuyerActivityRepository.resolveSavedTarget(type, itemId);
      if (!target) {
        return { saved: false, items: [] };
      }

      const exists = await BuyerActivityRepository.isSaved(userId, type, target);
      return { saved: Boolean(exists), items: [] };
    }

    // Get all saved items
    const items = await BuyerActivityRepository.getSavedItems(userId, type);
    return { items };
  }

  /**
   * Toggle saved item (save/unsave)
   */
  static async toggleSavedItem(userId, itemType, itemId) {
    if (!['product', 'supplier'].includes(itemType) || !itemId) {
      throw Object.assign(
        new Error('Valid item type and ID are required'),
        { statusCode: 422 }
      );
    }

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      throw Object.assign(new Error('Invalid item ID'), { statusCode: 422 });
    }

    const target = await BuyerActivityRepository.resolveSavedTarget(itemType, itemId);
    if (!target) {
      throw Object.assign(
        new Error(itemType === 'product' ? 'Product not found' : 'Supplier not found'),
        { statusCode: 404 }
      );
    }

    return BuyerActivityRepository.toggleSaved(userId, itemType, target);
  }
}

export default BuyerActivityService;