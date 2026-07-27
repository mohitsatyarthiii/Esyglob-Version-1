import test from 'node:test';
import assert from 'node:assert/strict';
import Product from '../src/models/Product.js';
import { normalizePricingTiers, productPriceForQuantity } from '../src/services/promotion.service.js';

test('normalizes a continuous three-tier MOQ schedule with an infinite final tier', () => {
  const tiers = normalizePricingTiers([
    { minimumQuantity: 1, maximumQuantity: 100, unitPrice: 50 },
    { minimumQuantity: 101, maximumQuantity: 500, unitPrice: 45 },
    { minimumQuantity: 501, maximumQuantity: null, unitPrice: 40 },
  ], 1);
  assert.deepEqual(tiers, [
    { minimumQuantity: 1, maximumQuantity: 100, unitPrice: 50 },
    { minimumQuantity: 101, maximumQuantity: 500, unitPrice: 45 },
    { minimumQuantity: 501, maximumQuantity: null, unitPrice: 40 },
  ]);
  assert.equal(productPriceForQuantity({ price: 60, priceTiers: tiers }, 800).unitPrice, 40);
});

test('rejects tier gaps, overlaps and more than three ranges', () => {
  assert.throws(() => normalizePricingTiers([
    { minimumQuantity: 1, maximumQuantity: 100, unitPrice: 50 },
    { minimumQuantity: 100, maximumQuantity: 500, unitPrice: 45 },
  ], 1), /must start at quantity 101/);
  assert.throws(() => normalizePricingTiers([
    { minimumQuantity: 1, maximumQuantity: 10, unitPrice: 4 },
    { minimumQuantity: 11, maximumQuantity: 20, unitPrice: 3 },
    { minimumQuantity: 21, maximumQuantity: 30, unitPrice: 2 },
    { minimumQuantity: 31, maximumQuantity: null, unitPrice: 1 },
  ], 1), /maximum of three/);
});

test('calculates scheduled product discounts against the active MOQ tier', () => {
  const result = productPriceForQuantity({
    price: 100,
    priceTiers: [{ minimumQuantity: 10, maximumQuantity: null, unitPrice: 80 }],
    discount: {
      type: 'percentage',
      value: 25,
      status: 'scheduled',
      startsAt: new Date('2026-01-01'),
      expiresAt: new Date('2027-01-01'),
    },
  }, 20, new Date('2026-07-27'));
  assert.equal(result.originalUnitPrice, 80);
  assert.equal(result.unitPrice, 60);
  assert.equal(result.savingsPerUnit, 20);
  assert.equal(result.discountPercentage, 25);
});

test('product schema rejects discounts above one hundred percent', async () => {
  const product = new Product({
    sellerId: '64b000000000000000000001',
    userId: '64b000000000000000000002',
    price: 100,
    discount: { type: 'percentage', value: 101, status: 'active' },
  });
  await assert.rejects(product.validate(), /cannot exceed 100/);
});
