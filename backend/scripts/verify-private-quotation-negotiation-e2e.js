import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Seller from '../src/models/Seller.js';
import Product from '../src/models/Product.js';
import Chat from '../src/models/Chat.js';
import Message from '../src/models/Message.js';
import Notification from '../src/models/Notification.js';
import RFQ from '../src/models/RFQ.js';
import Quotation from '../src/models/Quotation.js';
import * as rfqService from '../src/services/rfq.service.js';
import * as quotationService from '../src/services/quotation.service.js';

const databaseUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!databaseUrl) throw new Error('MongoDB is not configured');
const runId = `codex-negotiation-${Date.now()}`;
const ids = { users: [], sellers: [], products: [], rfqs: [], quotations: [] };
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function createPrivateRfq(buyerSession, sellerSession, seller, product, suffix) {
  const result = await rfqService.createRfq(buyerSession, {
    productId: String(product._id), sellerId: String(seller._id), title: `${runId} ${suffix}`,
    description: 'Private quotation negotiation E2E', category: product.category, subcategory: product.subcategory,
    quantity: 500, unit: 'pcs', deliveryCountry: 'India', deliveryTimeline: '30_days', visibility: 'private', status: 'active',
  });
  ids.rfqs.push(result.rfq._id);
  await rfqService.updateRfq(sellerSession, String(result.rfq._id), { action: 'accept', reason: 'E2E seller accepted RFQ' });
  return result.rfq;
}

async function createQuote(sellerSession, rfq, product, expiryDate) {
  const result = await quotationService.createQuotation(sellerSession, {
    rfqId: String(rfq._id), productId: String(product._id), unitPrice: 100, suppliedQuantity: 500,
    minimumOrderQuantity: 100, leadTime: 14, leadTimeUnit: 'days', paymentTerms: '30% advance',
    incoterms: 'FOB', shippingTerms: 'Freight quoted separately', currency: 'INR', expiryDate,
    sellerMessage: 'Initial seller offer at INR 100 per unit.',
  });
  ids.quotations.push(result.quotation._id);
  return result.quotation;
}

try {
  await mongoose.connect(databaseUrl);
  const [buyer, sellerUser] = await User.create([
    { email: `${runId}-buyer@example.invalid`, passwordHash: 'integration-test-only', fullName: 'Negotiation E2E Buyer', roles: ['buyer'], primaryRole: 'buyer', isActive: true },
    { email: `${runId}-seller@example.invalid`, passwordHash: 'integration-test-only', fullName: 'Negotiation E2E Seller', roles: ['seller'], primaryRole: 'seller', isActive: true },
  ]);
  ids.users.push(buyer._id, sellerUser._id);
  const seller = await Seller.create({ userId: sellerUser._id, companyName: 'Negotiation E2E Seller', companyType: 'manufacturer', productCategories: [`${runId} Steel`], productSubcategories: [`${runId} Pipes`], isActive: true, isSuspended: false, isVerified: true, verificationStatus: 'approved' });
  ids.sellers.push(seller._id);
  const product = await Product.create({ sellerId: seller._id, userId: sellerUser._id, name: `${runId} Steel Pipes`, slug: `${runId}-steel-pipes`, category: `${runId} Steel`, subcategory: `${runId} Pipes`, price: 100, minimumOrderQuantity: 100, unit: 'piece', description: 'E2E product', status: 'active', visibility: 'public', isVerifiedSeller: true });
  ids.products.push(product._id);
  const buyerSession = { userId: String(buyer._id), roles: ['buyer'], primaryRole: 'buyer', user: { fullName: buyer.fullName } };
  const sellerSession = { userId: String(sellerUser._id), roles: ['seller'], primaryRole: 'seller', user: { fullName: sellerUser.fullName } };

  const rfq = await createPrivateRfq(buyerSession, sellerSession, seller, product, 'Main RFQ');
  let quote = await createQuote(sellerSession, rfq, product, new Date(Date.now() + 86400000));
  assert(quote.status === 'submitted' && quote.currentOffer.unitPrice === 100, 'Initial quotation was not submitted at INR 100');
  assert(await Notification.exists({ eventKey: `quotation-submitted:${quote._id}:${buyer._id}` }), 'Buyer quotation notification missing');
  assert(await Message.exists({ receiverId: buyer._id, 'quotationDetails.quotationId': quote._id }), 'Buyer quotation message missing');

  await quotationService.updateQuotation(buyerSession, String(quote._id), { action: 'counter_offer', unitPrice: 90, suppliedQuantity: 500, reason: 'Can you match INR 90?', expectedNegotiationVersion: 1, idempotencyKey: `${runId}-counter-1` });
  let stored = await Quotation.findById(quote._id);
  assert(stored.status === 'countered' && stored.currentOffer.unitPrice === 90 && stored.currentOffer.previousUnitPrice === 100, 'First buyer counter was not persisted clearly');
  await quotationService.updateQuotation(buyerSession, String(quote._id), { action: 'counter_offer', unitPrice: 90, expectedNegotiationVersion: 1, idempotencyKey: `${runId}-counter-1` });
  stored = await Quotation.findById(quote._id);
  assert(stored.negotiationHistory.filter((entry) => entry.idempotencyKey === `${runId}-counter-1`).length === 1, 'Duplicate buyer counter history was created');
  assert(await Message.countDocuments({ deliveryKey: `quotation-counter_offer:${quote._id}:${runId}-counter-1` }) === 1, 'Duplicate buyer counter message was created');
  assert(await Notification.countDocuments({ eventKey: `quotation-counter_offer:${quote._id}:${runId}-counter-1` }) === 1, 'Duplicate buyer counter notification was created');

  await quotationService.updateQuotation(sellerSession, String(quote._id), { unitPrice: 95, suppliedQuantity: 500, minimumOrderQuantity: 100, leadTime: 14, sellerMessage: 'Revised to INR 95.', expectedNegotiationVersion: 2, idempotencyKey: `${runId}-revision-1` });
  stored = await Quotation.findById(quote._id);
  assert(stored.status === 'revised' && stored.currentOffer.unitPrice === 95 && stored.negotiationHistory.some((entry) => entry.unitPrice === 90), 'Seller revision to INR 95 lost the buyer counter');

  await quotationService.updateQuotation(buyerSession, String(quote._id), { action: 'counter_offer', unitPrice: 92, suppliedQuantity: 500, reason: 'Second buyer counter at INR 92.', expectedNegotiationVersion: 3, idempotencyKey: `${runId}-counter-2` });
  stored = await Quotation.findById(quote._id);
  assert(stored.status === 'countered' && stored.currentOffer.unitPrice === 92 && stored.currentOffer.previousUnitPrice === 95, 'Second buyer counter failed');

  await quotationService.updateQuotation(sellerSession, String(quote._id), { unitPrice: 93, suppliedQuantity: 500, minimumOrderQuantity: 100, leadTime: 14, sellerMessage: 'Final seller revision at INR 93.', expectedNegotiationVersion: 4, idempotencyKey: `${runId}-revision-2` });
  stored = await Quotation.findById(quote._id);
  assert(stored.status === 'revised' && stored.currentOffer.unitPrice === 93, 'Second seller revision failed');
  assert([100, 90, 95, 92, 93].every((price) => stored.negotiationHistory.some((entry) => Number(entry.unitPrice) === price)), 'Negotiation price history is incomplete');

  let staleBlocked = false;
  try { await quotationService.updateQuotation(buyerSession, String(quote._id), { action: 'counter_offer', unitPrice: 91, expectedNegotiationVersion: 4, idempotencyKey: `${runId}-stale` }); } catch (error) { staleBlocked = error.statusCode === 409 && /refresh/i.test(error.message); }
  assert(staleBlocked, 'A stale negotiation update was not rejected cleanly');

  await quotationService.respondToQuotation(buyerSession, String(quote._id), { action: 'accept', expectedNegotiationVersion: 5, idempotencyKey: `${runId}-accept` });
  stored = await Quotation.findById(quote._id);
  assert(stored.status === 'buyer_accepted' && stored.currentOffer.unitPrice === 93 && stored.currentOffer.action === 'accepted', 'Buyer acceptance did not lock INR 93 as the final offer');
  let terminalBlocked = false;
  try { await quotationService.updateQuotation(buyerSession, String(quote._id), { action: 'counter_offer', unitPrice: 91, expectedNegotiationVersion: 6, idempotencyKey: `${runId}-after-accept` }); } catch (error) { terminalBlocked = error.statusCode === 409; }
  assert(terminalBlocked, 'Negotiation remained actionable after acceptance');
  const refreshed = await quotationService.getQuotationDetail(buyerSession, String(quote._id));
  assert(refreshed.quotation.currentOffer.unitPrice === 93 && refreshed.quotation.negotiationHistory.length >= 6, 'Refresh did not preserve current offer and complete history');

  const rejectRfq = await createPrivateRfq(buyerSession, sellerSession, seller, product, 'Reject RFQ');
  const rejectQuote = await createQuote(sellerSession, rejectRfq, product, new Date(Date.now() + 86400000));
  await quotationService.respondToQuotation(buyerSession, String(rejectQuote._id), { action: 'reject', reason: 'Buyer rejection E2E', expectedNegotiationVersion: 1, idempotencyKey: `${runId}-reject` });
  assert((await Quotation.findById(rejectQuote._id)).status === 'rejected', 'Reject flow did not persist a terminal state');
  assert(await Message.exists({ deliveryKey: `quotation-rejected:${rejectQuote._id}:${runId}-reject` }), 'Reject message missing');

  const sellerAcceptRfq = await createPrivateRfq(buyerSession, sellerSession, seller, product, 'Seller Accept Counter RFQ');
  const sellerAcceptQuote = await createQuote(sellerSession, sellerAcceptRfq, product, new Date(Date.now() + 86400000));
  await quotationService.updateQuotation(buyerSession, String(sellerAcceptQuote._id), { action: 'counter_offer', unitPrice: 90, expectedNegotiationVersion: 1, idempotencyKey: `${runId}-seller-accept-counter` });
  await quotationService.updateQuotation(sellerSession, String(sellerAcceptQuote._id), { action: 'accept_counter', expectedNegotiationVersion: 2, idempotencyKey: `${runId}-seller-accept` });
  const sellerAccepted = await Quotation.findById(sellerAcceptQuote._id);
  assert(sellerAccepted.status === 'buyer_accepted' && sellerAccepted.unitPrice === 90, 'Seller could not accept the buyer counter as the agreed price');
  assert(await Notification.exists({ eventKey: `quotation-counter-accepted:${sellerAcceptQuote._id}:${runId}-seller-accept` }), 'Buyer notification for seller counter acceptance missing');

  const sellerRejectRfq = await createPrivateRfq(buyerSession, sellerSession, seller, product, 'Seller Reject Counter RFQ');
  const sellerRejectQuote = await createQuote(sellerSession, sellerRejectRfq, product, new Date(Date.now() + 86400000));
  await quotationService.updateQuotation(buyerSession, String(sellerRejectQuote._id), { action: 'counter_offer', unitPrice: 80, expectedNegotiationVersion: 1, idempotencyKey: `${runId}-seller-reject-counter` });
  await quotationService.updateQuotation(sellerSession, String(sellerRejectQuote._id), { action: 'reject', reason: 'Seller cannot accept INR 80.', expectedNegotiationVersion: 2, idempotencyKey: `${runId}-seller-reject` });
  assert((await Quotation.findById(sellerRejectQuote._id)).status === 'rejected', 'Seller counter rejection did not persist');
  assert(await Message.exists({ deliveryKey: `quotation-counter-rejected:${sellerRejectQuote._id}:${runId}-seller-reject` }), 'Buyer message for seller counter rejection missing');

  const expiredRfq = await createPrivateRfq(buyerSession, sellerSession, seller, product, 'Expired RFQ');
  const expiredQuote = await createQuote(sellerSession, expiredRfq, product, new Date(Date.now() - 60000));
  let expiryBlocked = false;
  try { await quotationService.updateQuotation(buyerSession, String(expiredQuote._id), { action: 'counter_offer', unitPrice: 90, expectedNegotiationVersion: 1, idempotencyKey: `${runId}-expired` }); } catch (error) { expiryBlocked = error.statusCode === 409 && /expired/i.test(error.message); }
  assert(expiryBlocked && (await Quotation.findById(expiredQuote._id)).status === 'expired', 'Expired quotation remained negotiable');

  console.log(JSON.stringify({ ok: true, rounds: [100, 90, 95, 92, 93], accepted: 93, duplicateProtected: true, staleBlocked: true, terminalBlocked: true, buyerRejectPassed: true, sellerAcceptCounterPassed: true, sellerRejectCounterPassed: true, expiryPassed: true, persistedAfterRefresh: true }));
} finally {
  if (mongoose.connection.readyState) {
    const userIds = ids.users;
    const chatIds = (await Chat.find({ $or: [{ buyerId: { $in: userIds } }, { sellerId: { $in: userIds } }] }).select('_id').lean()).map((item) => item._id);
    await Notification.deleteMany({ userId: { $in: userIds } });
    await Message.deleteMany({ $or: [{ chatId: { $in: chatIds } }, { senderId: { $in: userIds } }, { receiverId: { $in: userIds } }] });
    await Chat.deleteMany({ _id: { $in: chatIds } });
    await Quotation.deleteMany({ _id: { $in: ids.quotations } });
    await RFQ.deleteMany({ _id: { $in: ids.rfqs } });
    await Product.deleteMany({ _id: { $in: ids.products } });
    await Seller.deleteMany({ _id: { $in: ids.sellers } });
    await User.deleteMany({ _id: { $in: userIds } });
    await mongoose.disconnect();
  }
}
