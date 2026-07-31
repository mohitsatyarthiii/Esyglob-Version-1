import assert from 'node:assert/strict';
import test from 'node:test';
import Seller from '../src/models/Seller.js';

test('seller badge state is independently persisted and unknown badge keys are discarded', () => {
  const seller = new Seller({
    badges: {
      verifiedSeller: true,
      premiumSeller: false,
      trustedSupplier: true,
      goldSupplier: true,
      topRated: false,
      manufacturer: true,
      exporter: false,
      fastResponse: true,
      unsupportedBadge: true,
    },
  });
  const badges = seller.toObject().badges;
  assert.equal(badges.verifiedSeller, true);
  assert.equal(badges.goldSupplier, true);
  assert.equal(badges.fastResponse, true);
  assert.equal('unsupportedBadge' in badges, false);
});
