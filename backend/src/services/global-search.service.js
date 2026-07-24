import GlobalSearchRepository from '../repositories/global-search.repository.js';
import { listServices } from '../lib/services-catalog.js';

// Simple in-memory cache
const searchCache = new Map();
const CACHE_TTL = 20000; // 20 seconds
const MAX_SEARCH_CACHE_ENTRIES = 250;

class GlobalSearchService {
  /**
   * Score text relevance against query
   */
  static scoreText(query, primaryValues = [], secondaryValues = [], typeBoost = 0) {
    const q = String(query || '').trim().toLowerCase();
    const terms = GlobalSearchRepository.termsFromQuery(query);
    const primary = primaryValues.filter(Boolean).map(value => String(value).toLowerCase());
    const secondary = secondaryValues
      .flatMap(value => Array.isArray(value) ? value : [value])
      .filter(Boolean)
      .map(value => String(value).toLowerCase());
    const primaryText = primary.join(' ');
    const secondaryText = secondary.join(' ');
    let score = typeBoost;

    if (!q || (!primaryText && !secondaryText)) return score;
    if (primary.some(value => value === q)) score += 150;
    else if (primary.some(value => value.startsWith(q))) score += 115;
    else if (primaryText.includes(q)) score += 90;
    if (secondary.some(value => value === q)) score += 80;
    else if (secondaryText.includes(q)) score += 55;

    for (const term of terms) {
      if (primary.some(value => value.split(/\s+/).some(word => word === term))) score += 24;
      else if (primaryText.includes(term)) score += 16;
      if (secondaryText.includes(term)) score += 8;
    }

    if (terms.length > 1 && terms.every(term => `${primaryText} ${secondaryText}`.includes(term))) score += 30;
    return score;
  }

  /**
   * Format product result
   */
  static compactProduct(product, query) {
    return {
      id: String(product._id),
      type: 'product',
      label: product.name,
      meta: [product.category, product.sellerId?.companyName].filter(Boolean).join(' | ') || 'Product',
      href: `/products/${product._id}`,
      image: product.images?.[0] || '',
      score: this.scoreText(
        query,
        [product.name, product.brand, product.category, product.subcategory],
        [product.description, product.tags, product.countryOfOrigin, product.sellerId?.companyName],
        70
      )
        + (product.isVerifiedSeller || product.sellerId?.isVerified ? 8 : 0)
        + Math.min(10, Number(product.averageRating || 0))
        + Math.min(12, Math.log10(Number(product.totalOrders || 0) + 1) * 4),
      raw: product,
    };
  }

  /**
   * Format supplier result
   */
  static compactSeller(seller, query) {
    return {
      id: String(seller._id),
      type: seller.companyType === 'manufacturer' ? 'manufacturer' : 'supplier',
      label: seller.companyName,
      meta: [
        seller.companyType,
        seller.address?.country,
        seller.isVerified ? 'Verified' : '',
      ].filter(Boolean).join(' | ') || 'Supplier',
      href: `/sellers/${seller._id}`,
      image: seller.logoUrl || seller.companyLogo || seller.logo || '',
      score: this.scoreText(
        query,
        [seller.companyName, seller.companyType],
        [
          seller.companyDescription,
          seller.productCategories,
          seller.productSubcategories,
          seller.mainProducts,
          seller.industries,
          seller.exportMarkets,
          seller.address?.city,
          seller.address?.state,
          seller.address?.country,
        ],
        seller.companyType === 'manufacturer' ? 65 : 60
      )
        + (seller.isVerified ? 8 : 0)
        + (seller.isTrustedSeller ? 10 : 0),
      raw: seller,
    };
  }

  /**
   * Format category result
   */
  static compactCategory(category, query, type = 'category') {
    const href = type === 'subcategory'
      ? `/categories/${encodeURIComponent(category.categoryId?.slug || category.categoryId?.name || '')}/${encodeURIComponent(category.slug || category.name)}`
      : `/categories/${encodeURIComponent(category.slug || category.name)}`;

    return {
      id: String(category._id),
      type,
      label: category.name,
      meta: type === 'subcategory'
        ? `${category.categoryId?.name || 'Category'} subcategory`
        : 'Category',
      href,
      image: category.image || '',
      score: this.scoreText(
        query,
        [category.name, category.slug],
        [category.description, category.metadata?.keywords, category.categoryId?.name],
        type === 'category' ? 55 : 50
      ),
      raw: category,
    };
  }

  /**
   * Format RFQ result
   */
  static compactRfq(rfq, query) {
    return {
      id: String(rfq._id),
      type: 'rfq',
      label: rfq.title,
      meta: [
        rfq.category,
        rfq.deliveryCountry,
        `${rfq.quantity || ''} ${rfq.unit || ''}`.trim(),
      ].filter(Boolean).join(' | ') || 'Public RFQ',
      href: `/rfqs/${rfq._id}`,
      score: this.scoreText(
        query,
        [rfq.title, rfq.category, rfq.subcategory],
        [rfq.description, rfq.deliveryCountry, rfq.specifications],
        35
      ),
      raw: rfq,
    };
  }

  /**
   * Format service result
   */
  static compactService(service, query) {
    return {
      id: service.key,
      type: 'service',
      label: service.title,
      meta: 'Marketplace service',
      href: `/services/${service.key}`,
      score: this.scoreText(
        query,
        [service.key, service.title],
        [service.description, service.requirements, service.benefits],
        45
      ),
      raw: service,
    };
  }

  /**
   * Execute global search
   */
  static async search(queryParams = {}) {
    const query = queryParams.q || queryParams.search || '';
    const limit = Math.min(Math.max(parseInt(queryParams.limit, 10) || 8, 1), 20);
    const includeRaw = queryParams.raw === 'true';
    const trimmed = query.trim().slice(0, 100);

    // Return empty for short queries
    if (trimmed.length < 2) {
      return {
        query: trimmed,
        results: [],
        products: [],
        suppliers: [],
        categories: [],
        subcategories: [],
        services: [],
        rfqs: [],
      };
    }

    // Check cache
    const cacheKey = `global-search:${trimmed}:${limit}:${includeRaw}`;
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    // Build regex
    const regex = GlobalSearchRepository.buildRegex(trimmed);
    // Execute all searches in parallel
    const [products, suppliers, categories, subcategories, rfqs] = await Promise.all([
      GlobalSearchRepository.searchProducts(regex, limit),
      GlobalSearchRepository.searchSuppliers(regex, limit),
      GlobalSearchRepository.searchCategories(regex, limit),
      GlobalSearchRepository.searchSubcategories(regex, limit),
      GlobalSearchRepository.searchRfqs(regex, limit),
    ]);

    // Format services
    const services = listServices()
      .filter(service => `/services/${service.key}`)
      .map(service => this.compactService(service, trimmed))
      .filter(service => service.score > 45)
      .slice(0, limit);

    // Group results by type
    const grouped = {
      products: products
        .map(item => this.compactProduct(item, trimmed))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit),
      suppliers: suppliers
        .map(item => this.compactSeller(item, trimmed))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit),
      categories: categories
        .map(item => this.compactCategory(item, trimmed))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit),
      subcategories: subcategories
        .map(item => this.compactCategory(item, trimmed, 'subcategory'))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit),
      services,
      rfqs: rfqs
        .map(item => this.compactRfq(item, trimmed))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit),
    };

    // Combined results sorted by score
    const results = [
      ...grouped.products,
      ...grouped.suppliers,
      ...grouped.categories,
      ...grouped.subcategories,
      ...grouped.services,
      ...grouped.rfqs,
    ]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit * 4);

    // Remove raw data if not requested
    if (!includeRaw) {
      for (const list of Object.values(grouped)) {
        list.forEach(item => delete item.raw);
      }
      results.forEach(item => delete item.raw);
    }

    const data = {
      query: trimmed,
      results,
      suggestions: results.slice(0, Math.min(limit, 8)),
      ...grouped,
    };

    // Cache result
    if (searchCache.size >= MAX_SEARCH_CACHE_ENTRIES) {
      searchCache.delete(searchCache.keys().next().value);
    }
    searchCache.set(cacheKey, { data, timestamp: Date.now() });

    return data;
  }
}

export default GlobalSearchService;
