import ProductRepository from '../repositories/product.repository.js';
import mongoose from 'mongoose';

class ProductService {
  /**
   * Get products — SUPER FAST with denormalized flag
   */
  static async getProducts(query = {}, user = null) {
    const {
      type,
      category,
      subcategory,
      search,
      page: rawPage = 1,
      limit: rawLimit = 12,
      sort: rawSort = 'createdAt',
      order: rawOrder = 'desc'
    } = query;

    // Parse pagination - strict limits
    const page = Math.max(1, parseInt(rawPage) || 1);
    const limit = Math.min(Math.max(1, parseInt(rawLimit) || 12), 60);
    const sort = rawSort || 'createdAt';
    const order = rawOrder === 'asc' ? 1 : -1;

    // Build filter - EXACT matches, no regex
    const filter = {};

    if (category && category !== 'undefined' && category !== 'null') {
      filter.category = category;
    }

    if (subcategory && subcategory !== 'undefined' && subcategory !== 'null') {
      filter.subcategory = subcategory;
    }

    // Search - Use text index if search term exists
    if (search && search.trim()) {
      const searchTerm = search.trim().substring(0, 50);
      filter.$or = [
        { name: new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
      ];
    }

    // === SELLER DASHBOARD ===
    if (type === 'seller' && user?.roles?.includes('seller')) {
      const seller = await ProductRepository.findSellerByUserId(user._id);
      if (!seller) {
        return { products: [], total: 0, pagination: { total: 0, page, limit, totalPages: 0 } };
      }

      const result = await ProductRepository.getSellerProducts(
        seller._id, filter, { page, limit, sort, order }
      );

      return {
        ...result,
        pagination: {
          total: result.total,
          page,
          limit,
          totalPages: Math.ceil(result.total / limit)
        }
      };
    }

    // === CATEGORIES VIEW ===
    if (type === 'categories') {
      const categories = await ProductRepository.getProductCategories(filter);
      return { categories };
    }

    // === PUBLIC PRODUCT LISTING ===
    const result = await ProductRepository.getPublicProducts(
      filter, { page, limit, sort, order }
    );

    return result;
  }

  /**
   * Get product detail
   */
  static async getProductDetail(productId, user = null) {
    if (!productId) {
      const error = new Error('Product ID is required');
      error.statusCode = 404;
      throw error;
    }

    const product = await ProductRepository.findByIdOrSlug(productId);

    if (!product) {
      const error = new Error('Product not found');
      error.statusCode = 404;
      throw error;
    }

    // Check visibility
    const isPublic =
      ['active', 'published'].includes(product.status) &&
      product.sellerId?.isVerified &&
      product.sellerId?.isActive !== false &&
      product.sellerId?.isSuspended !== true;

    const isOwner = user && (
      String(product.userId) === String(user._id) ||
      String(product.sellerId?.userId) === String(user._id)
    );
    const isAdmin = user?.roles?.includes('admin');

    if (!isPublic && !isOwner && !isAdmin) {
      const error = new Error('Product not found');
      error.statusCode = 404;
      throw error;
    }

    // Get similar products in parallel
    const similarProducts = await ProductRepository.getSimilarProducts(
      product._id, product.category, 6
    );

    return {
      product,
      seller: product.sellerId,
      similarProducts
    };
  }

  /**
   * Create product — ✅ sets isVerifiedSeller flag
   */
  static async createProduct(userId, data) {
    const seller = await ProductRepository.findSellerByUserId(userId);
    if (!seller) {
      const error = new Error('Complete seller onboarding before adding products');
      error.statusCode = 409;
      throw error;
    }

    const [categoryDoc, subcategoryDoc] = await ProductRepository.findCategoryAndSubcategory(
      data.categoryId, data.subcategoryId
    );

    const isDraft = data.status === 'draft';
    if (!isDraft && (!categoryDoc || !subcategoryDoc)) {
      const error = new Error('Select a valid category and subcategory');
      error.statusCode = 422;
      throw error;
    }

    const product = await ProductRepository.create({
      ...data,
      name: data.name || 'Untitled product draft',
      sellerId: seller._id,
      userId,
      // ✅ NEW: Denormalize seller verification status at creation time
      isVerifiedSeller: seller.isVerified === true,
      categoryId: categoryDoc?._id,
      subcategoryId: subcategoryDoc?._id,
      category: categoryDoc?.name || data.category || '',
      subcategory: subcategoryDoc?.name || data.subcategory || '',
      directOrderEnabled: data.orderType === 'direct_order_enabled' || Boolean(data.directOrderEnabled),
      status: isDraft ? 'draft' : (data.status || 'published'),
    });

    await ProductRepository.incrementSellerProductCount(seller._id);

    if (categoryDoc && subcategoryDoc) {
      await ProductRepository.upsertCategoryMapping(product._id, categoryDoc._id, subcategoryDoc._id);
    }

    return {
      product,
      message: isDraft
        ? 'Product saved as draft'
        : seller.isVerified
          ? 'Product published successfully'
          : 'Product saved. It will be visible after seller verification.',
    };
  }

  /**
   * Update product
   */
  static async updateProduct(userId, productId, data) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      const error = new Error('Invalid product ID');
      error.statusCode = 400;
      throw error;
    }

    const product = await ProductRepository.findById(productId);
    if (!product) {
      const error = new Error('Product not found');
      error.statusCode = 404;
      throw error;
    }

    const seller = await ProductRepository.findSellerByUserId(userId);
    const isOwner = String(product.userId) === String(userId) ||
      (seller && String(product.sellerId) === String(seller._id));

    if (!isOwner) {
      const error = new Error('You can only update your own products');
      error.statusCode = 403;
      throw error;
    }

    Object.assign(product, data);
    product.updatedAt = new Date();
    await ProductRepository.save(product);

    return { success: true, product };
  }

  /**
   * Delete product
   */
  static async deleteProduct(userId, productId) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      const error = new Error('Invalid product ID');
      error.statusCode = 400;
      throw error;
    }

    const product = await ProductRepository.findById(productId);
    if (!product) {
      const error = new Error('Product not found');
      error.statusCode = 404;
      throw error;
    }

    const seller = await ProductRepository.findSellerByUserId(userId);
    const isOwner = String(product.userId) === String(userId) ||
      (seller && String(product.sellerId) === String(seller._id));

    if (!isOwner) {
      const error = new Error('You can only delete your own products');
      error.statusCode = 403;
      throw error;
    }

    await Promise.all([
      ProductRepository.decrementSellerProductCount(product.sellerId),
      ProductRepository.deleteCategoryMappings(product._id),
      ProductRepository.delete(productId),
    ]);

    return { success: true, message: 'Product deleted successfully' };
  }
}

export default ProductService;