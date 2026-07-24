import ProductRepository from '../repositories/product.repository.js';
import mongoose from 'mongoose';
import { productSchema, productUpdateSchema } from '../validators/product.validator.js';

function normalizeProductInput(data) {
  const normalized = { ...data };

  if (data.leadTime !== undefined) {
    normalized.leadTime = {
      value: Number(data.leadTime) || 0,
      unit: data.leadTimeUnit || 'days',
    };
  }
  if (data.deliveryTime !== undefined) {
    normalized.deliveryTime = {
      value: Number(data.deliveryTime) || 0,
      unit: data.deliveryTimeUnit || 'days',
    };
  }

  delete normalized.leadTimeUnit;
  delete normalized.deliveryTimeUnit;
  if (Array.isArray(data.certifications)) {
    normalized.certifications = data.certifications.map((certification) =>
      typeof certification === 'string' ? { name: certification } : certification
    );
  }
  return normalized;
}

function normalizedText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return Object.values(value).map(normalizedText).join(' ');
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenSet(...values) {
  return new Set(
    normalizedText(values)
      .split(/\s+/)
      .filter((token) => token.length > 2)
  );
}

function overlapScore(left, right) {
  if (!left.size || !right.size) return 0;
  let matches = 0;
  left.forEach((token) => {
    if (right.has(token)) matches += 1;
  });
  return matches / Math.max(left.size, right.size);
}

function sameValue(left, right) {
  return Boolean(left && right && String(left).toLowerCase() === String(right).toLowerCase());
}

class ProductService {
  /**
   * Get products — SUPER FAST with denormalized flag
   */
  static async getProducts(query = {}, user = null) {
    const {
      type,
      category,
      subcategory,
      seller,
      minPrice,
      maxPrice,
      search,
      page: rawPage = 1,
      limit: rawLimit = 12,
      sort: rawSort = 'createdAt',
      order: rawOrder = 'desc'
    } = query;

    // Parse pagination - strict limits
    const page = Math.max(1, parseInt(rawPage) || 1);
    const limit = Math.min(Math.max(1, parseInt(rawLimit) || 12), 60);
    const sortAliases = {
      latest: ['createdAt', -1],
      rating: ['averageRating', -1],
      price_asc: ['price', 1],
      price_desc: ['price', -1],
    };
    const allowedSorts = new Set(['createdAt', 'price', 'averageRating', 'totalOrders', 'minimumOrderQuantity']);
    const [sort, aliasOrder] = sortAliases[rawSort] || [allowedSorts.has(rawSort) ? rawSort : 'createdAt', null];
    const order = aliasOrder ?? (rawOrder === 'asc' ? 1 : -1);

    // Build filter - EXACT matches, no regex
    const filter = {};

    const validCategory = category && category !== 'undefined' && category !== 'null' ? category : null;
    const validSubcategory = subcategory && subcategory !== 'undefined' && subcategory !== 'null' ? subcategory : null;
    if (validCategory || validSubcategory) {
      const { categoryDoc, subcategoryDoc } = await ProductRepository.resolveListingTaxonomy(
        validCategory,
        validSubcategory
      );

      if (validCategory) {
        filter[categoryDoc ? 'categoryId' : 'category'] = categoryDoc?._id || validCategory;
      }
      if (validSubcategory) {
        filter[subcategoryDoc ? 'subcategoryId' : 'subcategory'] = subcategoryDoc?._id || validSubcategory;
      }
    }

    if (seller && seller !== 'undefined' && seller !== 'null' && mongoose.Types.ObjectId.isValid(seller)) {
      filter.sellerId = new mongoose.Types.ObjectId(seller);
    }

    const parsedMinPrice = Number(minPrice);
    const parsedMaxPrice = Number(maxPrice);
    if (Number.isFinite(parsedMinPrice) || Number.isFinite(parsedMaxPrice)) {
      filter.price = {};
      if (Number.isFinite(parsedMinPrice)) filter.price.$gte = parsedMinPrice;
      if (Number.isFinite(parsedMaxPrice)) filter.price.$lte = parsedMaxPrice;
    }

    if (search && search.trim()) {
      const searchTerm = search.trim().substring(0, 50);
      filter.$text = { $search: searchTerm };
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
      product.visibility !== 'private' &&
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

  static async getRelatedProducts(productId, rawLimit = 20) {
    const product = await ProductRepository.findByIdOrSlug(productId);
    if (!product) {
      const error = new Error('Product not found');
      error.statusCode = 404;
      throw error;
    }

    const limit = Math.min(Math.max(Number(rawLimit) || 20, 1), 40);
    const candidates = await ProductRepository.getRelatedProductCandidates(product, 100);
    const sourceName = tokenSet(product.name);
    const sourceKeywords = tokenSet(product.tags, product.seo?.keywords, product.description);
    const sourceSpecs = tokenSet(product.specifications, product.productAttributes);

    const products = candidates
      .map((candidate) => {
        let relevanceScore = 0;
        const relevanceReasons = [];
        if (
          sameValue(candidate.subcategoryId, product.subcategoryId) ||
          sameValue(candidate.subcategory, product.subcategory)
        ) {
          relevanceScore += 45;
          relevanceReasons.push('Same subcategory');
        }
        if (
          sameValue(candidate.categoryId, product.categoryId) ||
          sameValue(candidate.category, product.category)
        ) {
          relevanceScore += 28;
          relevanceReasons.push('Same category');
        }

        const nameSimilarity = overlapScore(sourceName, tokenSet(candidate.name));
        const keywordSimilarity = overlapScore(
          sourceKeywords,
          tokenSet(candidate.tags, candidate.seo?.keywords, candidate.description)
        );
        const specificationSimilarity = overlapScore(
          sourceSpecs,
          tokenSet(candidate.specifications, candidate.productAttributes)
        );
        relevanceScore += Math.round(nameSimilarity * 30);
        relevanceScore += Math.round(keywordSimilarity * 18);
        relevanceScore += Math.round(specificationSimilarity * 16);
        if (nameSimilarity > 0) relevanceReasons.push('Similar name');
        if (keywordSimilarity > 0) relevanceReasons.push('Matching keywords');
        if (specificationSimilarity > 0) relevanceReasons.push('Similar specifications');

        const manufacturerMatch =
          sameValue(candidate.brand, product.brand) ||
          sameValue(candidate.productType, product.productType) ||
          sameValue(candidate.manufacturingDetails?.processType, product.manufacturingDetails?.processType) ||
          sameValue(candidate.sellerId?.companyType, product.sellerId?.companyType);
        if (manufacturerMatch) {
          relevanceScore += 10;
          relevanceReasons.push('Similar manufacturer type');
        }

        relevanceScore += Math.min(Number(candidate.averageRating || 0), 5);
        relevanceScore += Math.min(Math.log10(Number(candidate.totalOrders || 0) + 1) * 2, 5);
        return { ...candidate, relevanceScore, relevanceReasons: [...new Set(relevanceReasons)] };
      })
      .filter((candidate) => candidate.relevanceScore >= 25)
      .sort((left, right) =>
        right.relevanceScore - left.relevanceScore ||
        Number(right.averageRating || 0) - Number(left.averageRating || 0) ||
        Number(right.totalOrders || 0) - Number(left.totalOrders || 0)
      )
      .slice(0, limit);

    return { productId: product._id, products, total: products.length };
  }

  /**
   * Create product — ✅ sets isVerifiedSeller flag
   */
  static async createProduct(userId, data) {
    data = productSchema.parse(data);
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
      ...normalizeProductInput(data),
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

    const parsedUpdate = productUpdateSchema.parse(data);
    const validatedData = Object.fromEntries(
      Object.keys(data)
        .filter((key) => Object.hasOwn(parsedUpdate, key))
        .map((key) => [key, parsedUpdate[key]])
    );
    Object.assign(product, normalizeProductInput(validatedData));
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
