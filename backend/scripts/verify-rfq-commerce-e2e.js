import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import 'dotenv/config';
import User from '../src/models/User.js';
import Seller from '../src/models/Seller.js';
import Product from '../src/models/Product.js';
import RFQ from '../src/models/RFQ.js';
import Quotation from '../src/models/Quotation.js';
import Message from '../src/models/Message.js';
import Notification from '../src/models/Notification.js';
import Order from '../src/models/Order.js';
import * as chatService from '../src/services/chat.service.js';
import * as rfqService from '../src/services/rfq.service.js';
import * as quotationService from '../src/services/quotation.service.js';
import * as tradeArtifactService from '../src/services/trade-artifact.service.js';
import OrderService from '../src/services/order.service.js';

const runId = Date.now().toString(36);
const key = (label) => `production-rfq-e2e:${runId}:${label}`;
const version = (quotation) => Number(quotation.negotiationVersion || 0);

async function quote(id) {
  return Quotation.findById(id);
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20_000 });
  const [buyer, sellerUser] = await Promise.all([
    User.findOne({ email: 'mohit11@gmail.com' }),
    User.findOne({ email: 'urbanwood@gmail.com' }),
  ]);
  assert.ok(buyer, 'Buyer test account is missing');
  assert.ok(sellerUser, 'Seller test account is missing');
  const seller = await Seller.findOne({ userId: sellerUser._id, isActive: true, isSuspended: { $ne: true } });
  assert.ok(seller, 'Active UrbanWood seller profile is missing');
  const product = await Product.findOne({ sellerId: seller._id, status: { $in: ['published', 'active'] }, $or: [{ name: /wood/i }, { category: /furniture|wood/i }, { subcategory: /furniture|wood/i }] });
  assert.ok(product, 'UrbanWood needs a published wood/furniture product');

  const buyerSession = { userId: String(buyer._id), roles: ['buyer'], primaryRole: 'buyer' };
  const sellerSession = { userId: String(sellerUser._id), roles: ['seller'], primaryRole: 'seller' };
  const buyerActor = { _id: buyer._id, id: String(buyer._id), roles: ['buyer'], fullName: buyer.fullName, email: buyer.email };
  const sellerActor = { _id: sellerUser._id, id: String(sellerUser._id), roles: ['seller'], fullName: sellerUser.fullName, email: sellerUser.email };
  const report = { runId, product: { id: product._id, name: product.name }, checks: {} };

  const rfqCountBeforeEnquiry = await RFQ.countDocuments({ buyerId: buyer._id });
  const enquiryChat = await chatService.createChat(buyerSession, { otherUserId: String(sellerUser._id), productId: String(product._id), role: 'buyer', enquiry: true });
  const enquiry = await chatService.sendMessage(buyerActor, String(enquiryChat.chat._id), { content: `Production enquiry ${runId}: confirm availability for 100 pcs.`, messageType: 'product', deliveryKey: key('enquiry'), productDetails: { productId: product._id, quantity: 100, unit: product.unit || 'pcs' } });
  assert.equal(await RFQ.countDocuments({ buyerId: buyer._id }), rfqCountBeforeEnquiry, 'Direct enquiry created an RFQ');
  assert.ok(await Notification.exists({ userId: sellerUser._id, notificationType: 'new_inquiry', 'data.relatedId': enquiryChat.chat._id }));
  assert.equal(String(enquiry.message.receiverId), String(sellerUser._id));
  report.checks.enquiry = 'passed';

  const privateInput = {
    idempotencyKey: key('private-rfq'),
    productId: product._id,
    sellerUserId: sellerUser._id,
    title: `Production private wood RFQ ${runId}`,
    description: 'Supply the linked wooden product with standard export packaging.',
    category: product.category,
    subcategory: product.subcategory,
    quantity: 100,
    unit: product.unit || 'pcs',
    currency: 'INR',
    deliveryCountry: 'India',
    deliveryTimeline: '30_days',
    visibility: 'private',
    status: 'submitted',
  };
  const privateCreated = await rfqService.createRfq(buyerSession, privateInput);
  const privateDuplicate = await rfqService.createRfq(buyerSession, privateInput);
  assert.equal(String(privateDuplicate.rfq._id), String(privateCreated.rfq._id));
  await rfqService.updateRfq(sellerSession, privateCreated.rfq._id, { action: 'accept', notes: 'UrbanWood will quote.' });
  assert.ok(await Notification.exists({ userId: sellerUser._id, notificationType: 'rfq_created', 'data.relatedId': privateCreated.rfq._id }));
  report.checks.privateRfq = 'passed';

  const createdQuote = await quotationService.createQuotation(sellerSession, {
    idempotencyKey: key('quotation'),
    rfqId: privateCreated.rfq._id,
    productId: product._id,
    unitPrice: 100,
    minimumOrderQuantity: 100,
    suppliedQuantity: 100,
    leadTime: 15,
    leadTimeUnit: 'days',
    paymentTerms: '30% advance, balance before dispatch',
    shippingCost: 500,
    taxes: { taxRate: 18 },
    sellerMessage: 'Initial production quotation.',
    status: 'submitted',
  });
  const duplicateQuote = await quotationService.createQuotation(sellerSession, {
    idempotencyKey: key('quotation'), rfqId: privateCreated.rfq._id, productId: product._id,
    unitPrice: 999, minimumOrderQuantity: 100, suppliedQuantity: 100, leadTime: 15, status: 'submitted',
  });
  assert.equal(duplicateQuote.reused, true);
  assert.equal(String(duplicateQuote.quotation._id), String(createdQuote.quotation._id));
  let quotation = await quote(createdQuote.quotation._id);
  assert.equal(quotation.totalPrice, 12300);
  assert.equal(quotation.taxes.amount, 1800);

  await quotationService.updateQuotation(buyerSession, quotation._id, { action: 'counter_offer', unitPrice: 90, suppliedQuantity: 100, reason: 'Buyer counter at 90.', expectedNegotiationVersion: version(quotation), idempotencyKey: key('counter-90') });
  quotation = await quote(quotation._id);
  const duplicateCounter = await quotationService.updateQuotation(buyerSession, quotation._id, { action: 'counter_offer', unitPrice: 90, suppliedQuantity: 100, reason: 'Buyer counter at 90.', expectedNegotiationVersion: 1, idempotencyKey: key('counter-90') });
  assert.equal(duplicateCounter.reused, true);

  await quotationService.updateQuotation(sellerSession, quotation._id, { unitPrice: 95, minimumOrderQuantity: 100, suppliedQuantity: 100, leadTime: 15, leadTimeUnit: 'days', paymentTerms: quotation.paymentTerms, shippingCost: 500, taxes: { taxRate: 18 }, sellerMessage: 'Seller revision at 95.', expectedNegotiationVersion: version(quotation), idempotencyKey: key('revision-95') });
  quotation = await quote(quotation._id);
  await assert.rejects(() => quotationService.updateQuotation(buyerSession, quotation._id, { action: 'counter_offer', unitPrice: 91, expectedNegotiationVersion: version(quotation) - 1, idempotencyKey: key('stale-counter') }), (error) => error.statusCode === 409 && error.staleQuotation);

  await quotationService.updateQuotation(buyerSession, quotation._id, { action: 'counter_offer', unitPrice: 92, suppliedQuantity: 100, reason: 'Buyer counter at 92.', expectedNegotiationVersion: version(quotation), idempotencyKey: key('counter-92') });
  quotation = await quote(quotation._id);
  await quotationService.updateQuotation(sellerSession, quotation._id, { unitPrice: 93, minimumOrderQuantity: 100, suppliedQuantity: 100, leadTime: 15, leadTimeUnit: 'days', paymentTerms: quotation.paymentTerms, shippingCost: 500, taxes: { taxRate: 18 }, sellerMessage: 'Final seller revision at 93.', expectedNegotiationVersion: version(quotation), idempotencyKey: key('revision-93') });
  quotation = await quote(quotation._id);
  assert.deepEqual(quotation.negotiationHistory.filter((event) => Number(event.unitPrice) > 0).map((event) => event.unitPrice), [100, 90, 95, 92, 93]);

  await assert.rejects(() => quotationService.respondToQuotation(sellerSession, quotation._id, { action: 'accept', expectedNegotiationVersion: version(quotation), idempotencyKey: key('unauthorized-accept') }), (error) => error.statusCode === 403);
  await quotationService.respondToQuotation(buyerSession, quotation._id, { action: 'accept', expectedNegotiationVersion: version(quotation), idempotencyKey: key('accept-93') });
  quotation = await quote(quotation._id);
  assert.equal(quotation.status, 'buyer_accepted');

  await assert.rejects(() => quotationService.updateQuotation(sellerSession, quotation._id, { action: 'confirm', unitPrice: 94, expectedNegotiationVersion: version(quotation), idempotencyKey: key('tampered-final') }), (error) => error.statusCode === 409);
  await quotationService.updateQuotation(sellerSession, quotation._id, { action: 'confirm', expectedNegotiationVersion: version(quotation), idempotencyKey: key('finalize'), reason: 'Prepare accepted Final Quotation.' });
  quotation = await quote(quotation._id);
  const finalDocument = quotation.tradeDocuments.id(quotation.finalQuotation.documentId);
  assert.equal(finalDocument.requiresSellerSignature, true);
  assert.equal(finalDocument.requiresBuyerSignature, true);
  await tradeArtifactService.signTradeDocument('quotation', quotation._id, finalDocument._id, sellerActor, { signerName: sellerUser.fullName, signatureType: 'typed', signatureValue: sellerUser.fullName, termsAccepted: true });
  quotation = await quote(quotation._id);
  assert.equal(quotation.status, 'final_quotation_pending');
  await tradeArtifactService.signTradeDocument('quotation', quotation._id, finalDocument._id, buyerActor, { signerName: buyer.fullName, signatureType: 'typed', signatureValue: buyer.fullName, termsAccepted: true });
  quotation = await quote(quotation._id);
  assert.equal(quotation.status, 'final_quotation_signed');
  assert.ok(quotation.finalQuotation.buyerSignedAt);
  const orderResult = await OrderService.startOrder(String(buyer._id), { quotationId: quotation._id });
  const order = await Order.findById(orderResult.order._id);
  assert.equal(order.pricePerUnit, 93);
  assert.equal(order.quantity, 100);
  assert.equal(order.subtotal, 9300);
  assert.equal(String(order.rfqId), String(privateCreated.rfq._id));
  assert.equal(String(order.quotationId), String(quotation._id));
  report.checks.negotiationAndOrder = 'passed';

  const publicCreated = await rfqService.createRfq(buyerSession, {
    idempotencyKey: key('public-rfq'), title: `Production public wood RFQ ${runId}`, description: 'Public sourcing test for matching wooden products.', category: product.category, subcategory: product.subcategory, quantity: 120, unit: product.unit || 'pcs', currency: 'INR', deliveryCountry: 'India', deliveryTimeline: '30_days', visibility: 'public', status: 'submitted',
  });
  const publicDetail = await rfqService.getRfqDetail(sellerSession, publicCreated.rfq._id);
  assert.equal(String(publicDetail.rfq._id), String(publicCreated.rfq._id));
  await rfqService.updateRfq(sellerSession, publicCreated.rfq._id, { action: 'accept', notes: 'Matched by product taxonomy.' });
  const publicQuote = await quotationService.createQuotation(sellerSession, { idempotencyKey: key('public-quote'), rfqId: publicCreated.rfq._id, productId: product._id, unitPrice: 110, minimumOrderQuantity: 100, suppliedQuantity: 120, leadTime: 20, leadTimeUnit: 'days', paymentTerms: 'Negotiable', shippingCost: 0, status: 'submitted' });
  assert.ok(await Notification.exists({ userId: buyer._id, notificationType: 'quotation_received', 'data.relatedId': publicQuote.quotation._id }));
  report.checks.publicRfq = 'passed';

  const rejectRfq = await rfqService.createRfq(buyerSession, { ...privateInput, idempotencyKey: key('reject-rfq'), title: `Production rejection RFQ ${runId}` });
  await rfqService.updateRfq(sellerSession, rejectRfq.rfq._id, { action: 'accept' });
  const rejectQuote = await quotationService.createQuotation(sellerSession, { idempotencyKey: key('reject-quote'), rfqId: rejectRfq.rfq._id, productId: product._id, unitPrice: 105, minimumOrderQuantity: 100, suppliedQuantity: 100, leadTime: 15, status: 'submitted' });
  let rejected = await quote(rejectQuote.quotation._id);
  await quotationService.respondToQuotation(buyerSession, rejected._id, { action: 'reject', reason: 'Commercial terms not suitable.', expectedNegotiationVersion: version(rejected), idempotencyKey: key('reject') });
  rejected = await quote(rejected._id);
  assert.equal(rejected.status, 'rejected');

  const expiryRfq = await rfqService.createRfq(buyerSession, { ...privateInput, idempotencyKey: key('expiry-rfq'), title: `Production expiry RFQ ${runId}` });
  await rfqService.updateRfq(sellerSession, expiryRfq.rfq._id, { action: 'accept' });
  const expiryQuote = await quotationService.createQuotation(sellerSession, { idempotencyKey: key('expiry-quote'), rfqId: expiryRfq.rfq._id, productId: product._id, unitPrice: 101, minimumOrderQuantity: 100, suppliedQuantity: 100, leadTime: 15, expiryDate: new Date(Date.now() + 60_000), status: 'submitted' });
  await Quotation.updateOne({ _id: expiryQuote.quotation._id }, { $set: { expiryDate: new Date(Date.now() - 1_000) } });
  await quotationService.getQuotationDetail(buyerSession, expiryQuote.quotation._id);
  assert.equal((await quote(expiryQuote.quotation._id)).status, 'expired');
  await rfqService.updateRfq(buyerSession, expiryRfq.rfq._id, { action: 'cancel' });
  report.checks.edgeStates = 'passed';

  const relatedMessages = await Message.countDocuments({ $or: [{ 'rfqDetails.rfqId': privateCreated.rfq._id }, { 'quotationDetails.quotationId': quotation._id }] });
  const relatedNotifications = await Notification.countDocuments({ 'data.relatedId': { $in: [privateCreated.rfq._id, quotation._id] } });
  assert.ok(relatedMessages >= 8, `Expected negotiation messages, found ${relatedMessages}`);
  assert.ok(relatedNotifications >= 6, `Expected negotiation notifications, found ${relatedNotifications}`);
  report.checks.persistence = { relatedMessages, relatedNotifications, negotiationEvents: quotation.negotiationHistory.length, signatureCount: quotation.tradeDocuments.id(quotation.finalQuotation.documentId).signatures.length };
  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.stack || error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
