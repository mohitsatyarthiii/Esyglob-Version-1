import assert from 'node:assert/strict';
import test from 'node:test';
import { checkoutShipmentForProduct } from '../src/lib/checkout-package.js';
import { getLiveCheckoutShipping, isIndianAddress } from '../src/lib/checkout-shipping.js';

test('checkout recognizes India by country name or ISO country code', () => {
  assert.equal(isIndianAddress({ country: 'India' }), true);
  assert.equal(isIndianAddress({ country: 'IN' }), true);
  assert.equal(isIndianAddress({ country: 'Bharat' }), true);
  assert.equal(isIndianAddress({ country: 'United States', countryCode: 'US' }), false);
});

test('international checkout exits before any domestic provider lookup', async () => {
  const result = await getLiveCheckoutShipping({
    userId: 'checkout-test',
    seller: {},
    destination: { country: 'United States', countryCode: 'US' },
    shipment: {},
  });
  assert.equal(result.internationalUnsupported, true);
  assert.deepEqual(result.options, []);
  assert.deepEqual(result.providerStatuses, []);
});

test('stored product packaging controls carrier measurements and scales package weight by quantity', () => {
  const shipment = checkoutShipmentForProduct({
    packaging: { weight: '750 g', dimensions: '20 x 10 x 5 cm', unitsPerPackage: 2 },
  }, {
    weightKg: 0.1,
    lengthCm: 1,
    widthCm: 1,
    heightCm: 1,
  }, 5);

  assert.deepEqual({
    weightKg: shipment.weightKg,
    lengthCm: shipment.lengthCm,
    widthCm: shipment.widthCm,
    heightCm: shipment.heightCm,
    packageCount: shipment.packageCount,
    packageSource: shipment.packageSource,
  }, {
    weightKg: 2.25,
    lengthCm: 20,
    widthCm: 10,
    heightCm: 5,
    packageCount: 3,
    packageSource: 'product',
  });
});

test('checkout measurements remain the fallback when product packaging is incomplete', () => {
  const shipment = checkoutShipmentForProduct({ packaging: { weight: '', dimensions: '' } }, {
    weightKg: 4,
    lengthCm: 30,
    widthCm: 20,
    heightCm: 10,
  }, 2);

  assert.equal(shipment.packageSource, 'checkout');
  assert.equal(shipment.weightKg, 4);
  assert.equal(shipment.lengthCm, 30);
});
