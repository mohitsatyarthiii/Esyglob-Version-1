import test from 'node:test';
import assert from 'node:assert/strict';
import Quotation from '../src/models/Quotation.js';
import Notification from '../src/models/Notification.js';
import Message from '../src/models/Message.js';
import { OPEN_RFQ_STATUSES } from '../src/lib/rfq-helpers.js';
import { sellerMatchesPublicRfq } from '../src/services/rfq.service.js';
import { quotationCurrentOffer } from '../src/services/quotation.service.js';
import { assertTransition } from '../src/services/business-lifecycle.service.js';
import { getConversationKey } from '../src/lib/chat-conversations.js';

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
