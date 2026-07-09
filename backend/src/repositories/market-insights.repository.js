import Product from '../models/Product.js';
import Seller from '../models/Seller.js';
import Order from '../models/Order.js';
import RFQ from '../models/RFQ.js';
import Quotation from '../models/Quotation.js';

class MarketInsightsRepository {
  /**
   * Get products for intelligence dashboard
   */
  static async getProductsForDashboard(limit = 80) {
    return Product.find({ status: { $in: ['active', 'published'] } })
      .select('name category subcategory images')
      .limit(limit)
      .lean();
  }

  /**
   * Build regex for product matching
   */
  static buildProductRegex(productName, category = '') {
    const terms = `${productName} ${category}`
      .split(/\s+/)
      .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .filter(term => term.length > 2)
      .slice(0, 6);
    return terms.length ? new RegExp(terms.join('|'), 'i') : /$a/;
  }

  /**
   * Get marketplace data for a product
   */
  static async getMarketplaceData(productName, category = '', targetCountry = '') {
    const rx = this.buildProductRegex(productName, category);
    const countryRx = targetCountry ? new RegExp(targetCountry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;

    const productMatch = {
      status: { $in: ['active', 'published'] },
      $or: [
        { name: rx },
        { category: rx },
        { subcategory: rx },
        { tags: rx },
      ],
    };

    const [products, productAgg, rfqCount, quotationAgg, orderAgg] = await Promise.all([
      Product.find(productMatch)
        .select('_id sellerId price currency minimumOrderQuantity averageRating reviewCount totalOrders countryOfOrigin category subcategory leadTime deliveryTime shipping certifications packaging')
        .limit(200)
        .lean(),
      Product.aggregate([
        { $match: productMatch },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            avgPrice: { $avg: '$price' },
            avgMoq: { $avg: '$minimumOrderQuantity' },
            avgRating: { $avg: '$averageRating' },
            avgOrders: { $avg: '$totalOrders' },
          },
        },
      ]),
      RFQ.countDocuments({
        $or: [{ title: rx }, { category: rx }, { subcategory: rx }, { 'items.name': rx }],
        ...(countryRx ? { deliveryCountry: countryRx } : {}),
        status: { $nin: ['draft', 'archived', 'closed', 'rejected', 'expired'] },
      }),
      Quotation.aggregate([
        { $match: { status: { $nin: ['withdrawn', 'expired', 'rejected'] } } },
        {
          $group: {
            _id: null,
            avgUnitPrice: { $avg: '$unitPrice' },
            avgLeadTime: { $avg: '$leadTime' },
            count: { $sum: 1 },
          },
        },
      ]),
      Order.aggregate([
        { $match: { status: { $nin: ['cancelled', 'rejected', 'refunded'] } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalValue: { $sum: { $ifNull: ['$totalAmount', '$totalPrice'] } },
            avgQuantity: { $avg: '$quantity' },
          },
        },
      ]),
    ]);

    // Get sellers
    const sellerIds = [...new Set(products.map(p => String(p.sellerId)).filter(Boolean))];
    const sellers = sellerIds.length
      ? await Seller.find({ _id: { $in: sellerIds } })
          .select('_id companyName companyType isVerified rating reviewCount address shippingInfo totalProducts responseRate averageResponseTimeHours onTimeDeliveryRate')
          .lean()
      : [];

    // Aggregate supplier countries
    const supplierCountries = new Map();
    sellers.forEach(seller => {
      const country = seller.address?.country || 'Not specified';
      supplierCountries.set(country, (supplierCountries.get(country) || 0) + 1);
    });

    // Aggregate origin countries
    const origins = new Map();
    products.forEach(product => {
      const origin = product.countryOfOrigin || 'Not specified';
      origins.set(origin, (origins.get(origin) || 0) + 1);
    });

    const stats = productAgg[0] || {};
    const qStats = quotationAgg[0] || {};
    const oStats = orderAgg[0] || {};

    return {
      productCount: stats.count || 0,
      supplierCount: sellers.length,
      verifiedSupplierCount: sellers.filter(s => s.isVerified).length,
      averagePrice: stats.avgPrice || null,
      averageMoq: stats.avgMoq || null,
      averageRating: stats.avgRating || null,
      averageOrdersPerProduct: stats.avgOrders || null,
      rfqCount,
      quotationCount: qStats.count || 0,
      averageQuotationPrice: qStats.avgUnitPrice || null,
      averageLeadTime: qStats.avgLeadTime || null,
      orderCount: oStats.count || 0,
      orderValue: oStats.totalValue || null,
      averageOrderQuantity: oStats.avgQuantity || null,
      supplierCountries: [...supplierCountries.entries()]
        .map(([country, count]) => ({ country, count }))
        .sort((a, b) => b.count - a.count),
      originCountries: [...origins.entries()]
        .map(([country, count]) => ({ country, count }))
        .sort((a, b) => b.count - a.count),
    };
  }
}

export default MarketInsightsRepository;