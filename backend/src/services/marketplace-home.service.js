import AIChat from '../models/AIChat.js';
import ContactLead from '../models/ContactLead.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import RFQ from '../models/RFQ.js';
import Seller from '../models/Seller.js';
import User from '../models/User.js';
import { PUBLIC_PRODUCT_ELIGIBILITY, PUBLIC_SELLER_ELIGIBILITY } from '../lib/marketplace-eligibility.js';

let cached = null;
let expiresAt = 0;

export async function getMarketplaceStatistics() {
  if (cached && expiresAt > Date.now()) return cached;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const verifiedSellerQuery = PUBLIC_SELLER_ELIGIBILITY;
  const eligibleSellerIds = await Seller.distinct('_id', verifiedSellerQuery);
  const [
    verifiedManufacturers,
    activeBuyers,
    countries,
    productsListed,
    rfqsCreated,
    successfulTrades,
    dailyEnquiries,
    aiSearches,
  ] = await Promise.all([
    Seller.countDocuments(verifiedSellerQuery),
    User.countDocuments({ roles: 'buyer', isActive: { $ne: false }, isBanned: { $ne: true } }),
    Seller.distinct('address.country', { ...verifiedSellerQuery, 'address.country': { $nin: ['', null] } }),
    Product.countDocuments({ ...PUBLIC_PRODUCT_ELIGIBILITY, sellerId: { $in: eligibleSellerIds } }),
    RFQ.countDocuments({ status: { $ne: 'draft' } }),
    Order.countDocuments({ status: { $in: ['delivered', 'completed'] } }),
    ContactLead.countDocuments({ createdAt: { $gte: today } }),
    AIChat.countDocuments({}),
  ]);
  cached = {
    verifiedManufacturers,
    activeBuyers,
    countriesConnected: countries.length,
    productsListed,
    rfqsCreated,
    successfulTrades,
    dailyEnquiries,
    aiSearches,
  };
  expiresAt = Date.now() + 5 * 60_000;
  return cached;
}
