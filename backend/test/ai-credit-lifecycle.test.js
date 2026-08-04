import test from 'node:test';
import assert from 'node:assert/strict';
import AIUsage from '../src/models/AIUsage.js';
import Subscription from '../src/models/Subscription.js';
import { commitUsageReservation, creditSnapshot, releaseUsageReservation } from '../src/lib/subscription-access.js';

function request() {
  return {
    aiCreditReservation: {
      usageId: 'usage-1',
      subscription: { _id: 'subscription-1' },
      plan: { aiCredits: { monthly: 20 } },
      feature: 'aiRequests',
      amount: 1,
    },
  };
}

test('successful AI usage transfers one reserved credit exactly once', async () => {
  const originalUsageUpdate = AIUsage.findOneAndUpdate;
  const originalSubscriptionUpdate = Subscription.findByIdAndUpdate;
  let claims = 0;
  let charges = 0;
  AIUsage.findOneAndUpdate = async () => (++claims === 1 ? { _id: 'usage-1', status: 'success' } : null);
  Subscription.findByIdAndUpdate = async (_id, update) => {
    charges += 1;
    assert.deepEqual(update.$inc, { aiCreditsReserved: -1, aiCreditsUsed: 1, 'usage.aiRequests': 1 });
    return { aiCreditsAllocated: 20, aiCreditsUsed: 6, aiCreditsReserved: 0 };
  };
  try {
    const req = request();
    const first = await commitUsageReservation(req, { responseTokens: 42, responseTime: 900 });
    const second = await commitUsageReservation(req);
    assert.equal(first.remaining, 14);
    assert.equal(second.remaining, 14);
    assert.equal(charges, 1);
  } finally {
    AIUsage.findOneAndUpdate = originalUsageUpdate;
    Subscription.findByIdAndUpdate = originalSubscriptionUpdate;
  }
});

test('failed AI usage releases its reservation without consuming a credit', async () => {
  const originalUsageUpdate = AIUsage.findOneAndUpdate;
  const originalSubscriptionUpdate = Subscription.updateOne;
  AIUsage.findOneAndUpdate = async () => ({ _id: 'usage-1', status: 'failed' });
  let releaseUpdate;
  Subscription.updateOne = async (_filter, update) => { releaseUpdate = update; return { modifiedCount: 1 }; };
  try {
    const req = request();
    await releaseUsageReservation(req, new Error('provider unavailable'));
    await releaseUsageReservation(req, new Error('duplicate callback'));
    assert.deepEqual(releaseUpdate.$inc, { aiCreditsReserved: -1 });
    assert.equal(req.aiCreditSettled, true);
  } finally {
    AIUsage.findOneAndUpdate = originalUsageUpdate;
    Subscription.updateOne = originalSubscriptionUpdate;
  }
});

test('credit snapshots expose remaining, usage percentage, and low balance state', () => {
  const snapshot = creditSnapshot({ aiCreditsAllocated: 10, aiCreditsUsed: 8, aiCreditsReserved: 0 }, { aiCredits: 10 }, 3);
  assert.equal(snapshot.remaining, 2);
  assert.equal(snapshot.usagePercentage, 80);
  assert.equal(snapshot.todayUsed, 3);
  assert.equal(snapshot.low, true);
  assert.equal(snapshot.exhausted, false);
});
