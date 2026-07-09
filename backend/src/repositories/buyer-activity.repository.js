import RecentlyViewed from '../models/RecentlyViewed.js';
import SavedItem from '../models/SavedItem.js';
import Product from '../models/Product.js';
import Seller from '../models/Seller.js';
import mongoose from 'mongoose';

class BuyerActivityRepository {
  /**
   * Check valid ObjectId
   */
  static isValidId(id) {
    return mongoose.Types.ObjectId.isValid(id);
  }

  // ==================== RECENTLY VIEWED ====================

  /**
   * Track recently viewed product (upsert)
   */
  static async trackRecentlyViewed(userId, productId) {
    if (!this.isValidId(productId)) return null;

    return RecentlyViewed.findOneAndUpdate(
      { userId, productId },
      { $set: { viewedAt: new Date() } },
      { upsert: true, new: true }
    );
  }

  // ==================== SAVED ITEMS ====================

  /**
   * Resolve saved target (product or supplier)
   */
  static async resolveSavedTarget(itemType, itemId) {
    if (!this.isValidId(itemId)) return null;

    if (itemType === 'product') {
      const product = await Product.findById(itemId).select('_id').lean();
      return product ? { productId: product._id } : null;
    }

    // supplier - check both _id and userId
    const seller = await Seller.findOne({
      $or: [{ _id: itemId }, { userId: itemId }],
    }).select('_id').lean();
    return seller ? { sellerId: seller._id } : null;
  }

  /**
   * Get all saved items for user
   */
  static async getSavedItems(userId, type = null) {
    const query = { userId };
    if (type) query.itemType = type;

    return SavedItem.find(query)
      .populate('productId', 'name images price category minimumOrderQuantity')
      .populate({
        path: 'sellerId',
        select: 'companyName companyType isVerified verificationLevel rating address userId companyLogo logo logoUrl',
        populate: { path: 'userId', select: 'fullName avatarUrl avatar profileImage' },
      })
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * Check if item is saved
   */
  static async isSaved(userId, itemType, target) {
    return SavedItem.exists({
      userId,
      itemType,
      ...target,
    });
  }

  /**
   * Toggle saved item (save if not exists, unsave if exists)
   */
  static async toggleSaved(userId, itemType, target) {
    // Try to delete first
    const deleted = await SavedItem.findOneAndDelete({
      userId,
      itemType,
      ...target,
    }).select('_id');

    if (deleted) {
      return { saved: false };
    }

    // Create if not exists
    await SavedItem.findOneAndUpdate(
      { userId, itemType, ...target },
      { $setOnInsert: { userId, itemType, ...target } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return { saved: true };
  }

  /**
   * Ensure saved item indexes
   */
  static async ensureIndexes() {
    await SavedItem.syncIndexes();
  }
}

export default BuyerActivityRepository;