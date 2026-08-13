import test from 'node:test';
import assert from 'node:assert/strict';
import Quotation from '../src/models/Quotation.js';
import Notification from '../src/models/Notification.js';
import { OPEN_RFQ_STATUSES } from '../src/lib/rfq-helpers.js';
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
});
