import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCommercialTotal, resolveOrderPayableAmount } from '../src/lib/order-totals.js';

test('calculates the payable amount from locked unit price and quantity plus checkout adjustments', () => {
  assert.deepEqual(
    calculateCommercialTotal({
      unitPrice: 125.5,
      quantity: 8,
      shippingCost: 90,
      taxAmount: 180.72,
      discount: 25,
    }),
    {
      unitPrice: 125.5,
      quantity: 8,
      subtotal: 1004,
      shippingCost: 90,
      taxAmount: 180.72,
      discount: 25,
      totalAmount: 1249.72,
    },
  );
});

test('rejects missing, invalid, and non-positive commercial values', () => {
  assert.throws(() => calculateCommercialTotal({ unitPrice: undefined, quantity: 2 }), /Final Unit Price/);
  assert.throws(() => calculateCommercialTotal({ unitPrice: 10, quantity: 0 }), /Final Quantity/);
  assert.throws(() => calculateCommercialTotal({ unitPrice: 10, quantity: 1, discount: 11 }), /greater than zero/);
});

test('resolves a valid stored total and reconstructs missing legacy totals', () => {
  assert.equal(resolveOrderPayableAmount({ totalAmount: 725.456 }), 725.46);
  assert.equal(resolveOrderPayableAmount({
    pricePerUnit: 200,
    quantity: 3,
    shippingCost: 40,
    taxAmount: 20,
    discount: 10,
  }), 650);
});
