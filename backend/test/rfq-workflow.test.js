import test from 'node:test';
import assert from 'node:assert/strict';
import Quotation from '../src/models/Quotation.js';
import Notification from '../src/models/Notification.js';
import Message from '../src/models/Message.js';
import RFQ from '../src/models/RFQ.js';
import { OPEN_RFQ_STATUSES } from '../src/lib/rfq-helpers.js';
import { sellerMatchesPublicRfq } from '../src/services/rfq.service.js';
import { productMatchesRfqTaxonomy, quotationCurrentOffer, sellerMatchesRfqTaxonomy } from '../src/services/quotation.service.js';
import { assertTransition } from '../src/services/business-lifecycle.service.js';
import { getConversationKey } from '../src/lib/chat-conversations.js';
import { calculateQuotationTotals } from '../src/lib/quotation-commerce.js';

test('newly submitted public RFQs remain discoverable while terminal statuses do not', () => {
  assert.equal(OPEN_RFQ_STATUSES.includes('submitted'), true);
  assert.equal(OPEN_RFQ_STATUSES.includes('quoted'), true);
  assert.equal(OPEN_RFQ_STATUSES.includes('expired'), false);
  assert.equal(OPEN_RFQ_STATUSES.includes('cancelled'), false);
});

test('quotation lifecycle rejects payment-path transitions from terminal states', () => {
  assert.equal(assertTransition({ type: 'quotation', status: 'submitted', action: 'accept', actorRole: 'buyer' }), 'buyer_accepted');
  assert.throws(() => assertTransition({ type: 'quotation', status: 'rejected', action: 'accept', actorRole: 'buyer' }), /cannot accept/);
  assert.throws(() => assertTransition({ type: 'quotation', status: 'expired', action: 'accept', actorRole: 'buyer' }), /cannot accept/);
});

test('conversation and notification schemas enforce workflow deduplication keys', () => {
  assert.equal(getConversationKey('buyer-1', 'manufacturer-1'), 'buyer-1:manufacturer-1');
  const quotationIndex = Quotation.schema.indexes().find(([, options]) => options.name === 'one_open_quotation_per_manufacturer_rfq');
  assert.equal(quotationIndex?.[1]?.unique, true);
  const notificationIndex = Notification.schema.indexes().find(([fields]) => fields.userId === 1 && fields.eventKey === 1);
  assert.equal(notificationIndex?.[1]?.unique, true);
  const messageIndex = Message.schema.indexes().find(([fields]) => fields.deliveryKey === 1);
  assert.equal(messageIndex?.[1]?.unique, true);
  const rfqIndex = RFQ.schema.indexes().find(([, options]) => options.name === 'one_rfq_per_buyer_idempotency_key');
  assert.equal(rfqIndex?.[1]?.unique, true);
});

test('public RFQ matching requires the exact category and subcategory pair', () => {
  const sellers = [
    { name: 'Seller A', productCategories: ['Steel'], productSubcategories: ['Pipes'] },
    { name: 'Seller B', productCategories: ['Machinery'], productSubcategories: ['CNC Machines'] },
    { name: 'Seller C', productCategories: ['Steel'], productSubcategories: ['Sheets'] },
  ];

  assert.deepEqual(
    sellers.filter((seller) => sellerMatchesPublicRfq(seller, { category: 'Steel', subcategory: 'Pipes' })).map((seller) => seller.name),
    ['Seller A']
  );
  assert.deepEqual(
    sellers.filter((seller) => sellerMatchesPublicRfq(seller, { category: 'Machinery', subcategory: 'CNC Machines' })).map((seller) => seller.name),
    ['Seller B']
  );
});

test('quotation authorization enforces the same public RFQ taxonomy match', () => {
  const seller = { productCategories: ['Furniture'], productSubcategories: ['Outdoor Furniture'] };
  assert.equal(sellerMatchesRfqTaxonomy(seller, { category: 'Furniture', subcategory: 'Outdoor Furniture' }), true);
  assert.equal(sellerMatchesRfqTaxonomy(seller, { category: 'Furniture', subcategory: 'Office Furniture' }), false);
  assert.equal(sellerMatchesRfqTaxonomy(seller, { category: 'Steel', subcategory: 'Outdoor Furniture' }), false);
});

test('an owned catalogue product can satisfy public RFQ taxonomy when seller profile metadata is stale', () => {
  const rfq = { category: 'Furniture', subcategory: 'Outdoor Furniture' };
  assert.equal(productMatchesRfqTaxonomy({ category: 'Furniture', subcategory: 'Outdoor Furniture' }, rfq), true);
  assert.equal(productMatchesRfqTaxonomy({ category: 'Furniture', subcategory: 'Office Furniture' }, rfq), false);
  assert.equal(productMatchesRfqTaxonomy({ category: 'Steel', subcategory: 'Outdoor Furniture' }, rfq), false);
});

test('RFQ commercial fields do not expose status as a buyer-controlled update', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../src/services/rfq.service.js', import.meta.url), 'utf8'));
  const allowedFields = source.match(/const allowedFields = \[([\s\S]*?)\];/)?.[1] || '';
  assert.equal(/['"]status['"]/.test(allowedFields), false);
});

test('chat delivery idempotency is enforced only while sending messages', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../src/services/chat.service.js', import.meta.url), 'utf8'));
  const readStart = source.indexOf('export async function getChatMessages');
  const sendStart = source.indexOf('export async function sendMessage');
  const actionStart = source.indexOf('export async function performChatAction');
  const readSource = source.slice(readStart, sendStart);
  const sendSource = source.slice(sendStart, actionStart);

  assert.equal(readSource.includes('findMessageByDeliveryKey'), false);
  assert.equal(sendSource.includes('findMessageByDeliveryKey'), true);
});

test('starting an order returns an existing quotation order before enforcing pre-order status', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../src/services/order.service.js', import.meta.url), 'utf8'));
  const startOrder = source.slice(source.indexOf('static async startOrder'), source.indexOf('static async buyerAction'));
  assert.ok(startOrder.indexOf('Order.findOne({ quotationId: quotation._id })') < startOrder.indexOf("const fullySigned = quotation.status === 'final_quotation_signed'"));
});

test('a buyer counter remains open for seller revise, accept, reject, or withdraw actions', () => {
  const actions = ['revise', 'accept_counter', 'reject', 'withdraw'];
  for (const action of actions) {
    assert.doesNotThrow(() => assertTransition({ type: 'quotation', status: 'countered', action, actorRole: 'seller' }));
  }
  assert.equal(assertTransition({ type: 'quotation', status: 'countered', action: 'revise', actorRole: 'seller' }), 'revised');
  assert.equal(assertTransition({ type: 'quotation', status: 'countered', action: 'accept_counter', actorRole: 'seller' }), 'buyer_accepted');
});

test('current offer supports legacy quotations and preserves buyer counters independently', () => {
  assert.equal(quotationCurrentOffer({ unitPrice: 100, userId: 'seller', negotiationHistory: [] }).unitPrice, 100);
  const counter = quotationCurrentOffer({
    unitPrice: 100,
    currentOffer: { action: 'buyer_counter', actorRole: 'buyer', unitPrice: 90, previousUnitPrice: 100 },
  });
  assert.equal(counter.unitPrice, 90);
  assert.equal(counter.previousUnitPrice, 100);
  assert.equal(counter.actorRole, 'buyer');
});

test('multiple counter and revision rounds remain valid until buyer acceptance', () => {
  const states = [
    ['submitted', 'buyer', 'counter_offer', 'countered'],
    ['countered', 'seller', 'revise', 'revised'],
    ['revised', 'buyer', 'counter_offer', 'countered'],
    ['countered', 'seller', 'revise', 'revised'],
    ['revised', 'buyer', 'accept', 'buyer_accepted'],
  ];
  for (const [status, actorRole, action, expected] of states) {
    assert.equal(assertTransition({ type: 'quotation', status, action, actorRole }), expected);
  }
  assert.throws(() => assertTransition({ type: 'quotation', status: 'buyer_accepted', action: 'counter_offer', actorRole: 'buyer' }), /cannot counter_offer/);
  assert.throws(() => assertTransition({ type: 'quotation', status: 'final_quotation_signed', action: 'revise', actorRole: 'seller' }), /cannot revise/);
});

test('backend quotation totals reject manipulated and non-finite commercial values', () => {
  assert.deepEqual(calculateQuotationTotals({ unitPrice: 93, quantity: 500, shippingCost: 250, taxAmount: 100 }), {
    unitPrice: 93,
    quantity: 500,
    productSubtotal: 46500,
    shippingCost: 250,
    taxAmount: 100,
    otherCharges: 0,
    discount: 0,
    finalTotal: 46850,
  });
  assert.equal(calculateQuotationTotals({ unitPrice: 100, quantity: 10, taxRate: 18 }).finalTotal, 1180);
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, 'not-a-price']) {
    assert.throws(() => calculateQuotationTotals({ unitPrice: value, quantity: 100 }), /Unit price/);
  }
  assert.throws(() => calculateQuotationTotals({ unitPrice: 93, quantity: 0 }), /Quantity/);
});

test('negotiation events carry durable identity, relationship, offer, and timestamp fields', async () => {
  const quotation = new Quotation({
    rfqId: new Quotation.base.Types.ObjectId(),
    sellerId: new Quotation.base.Types.ObjectId(),
    userId: new Quotation.base.Types.ObjectId(),
    unitPrice: 100,
    minimumOrderQuantity: 100,
    suppliedQuantity: 100,
    leadTime: 10,
    negotiationHistory: [
      { action: 'submitted', actorRole: 'seller', unitPrice: 100, totalPrice: 10000 },
      { action: 'buyer_counter', actorRole: 'buyer', unitPrice: 90, totalPrice: 9000 },
    ],
  });
  await quotation.validate();
  const [submitted, counter] = quotation.negotiationHistory;
  assert.ok(submitted.eventId);
  assert.equal(String(submitted.rfqId), String(quotation.rfqId));
  assert.equal(String(submitted.quotationId), String(quotation._id));
  assert.ok(submitted.timestamp);
  assert.equal(counter.status, 'countered');
  assert.equal(counter.previousOffer.unitPrice, 100);
  assert.equal(counter.newOffer.unitPrice, 90);
  assert.ok(counter.changedTerms.includes('unitPrice'));
});

test('final quotation and order source enforce buyer signature and locked buyer handoff', async () => {
  const fs = await import('node:fs/promises');
  const quotationSource = await fs.readFile(new URL('../src/services/quotation.service.js', import.meta.url), 'utf8');
  const orderSource = await fs.readFile(new URL('../src/services/order.service.js', import.meta.url), 'utf8');
  assert.match(quotationSource, /requiresBuyerSignature:\s*true/);
  assert.match(orderSource, /Only the Buyer can create an order from the fully signed Final Quotation/);
  assert.match(orderSource, /const sellerInput = \{\}/);
});
