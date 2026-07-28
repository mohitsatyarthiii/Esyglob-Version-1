import assert from 'node:assert/strict';
import test from 'node:test';
import { applyQuoteBadges, determineRouteType } from '../src/services/service-engine.service.js';
import { providerSearchSchema } from '../src/validators/service-booking.validator.js';

test('routes India-to-India only to domestic providers and cross-country shipments internationally', () => {
  assert.equal(determineRouteType({ countryCode: 'IN' }, { countryCode: 'IN' }), 'domestic');
  assert.equal(determineRouteType({ countryCode: 'IN' }, { countryCode: 'CN' }), 'international');
  assert.equal(determineRouteType({ countryCode: 'US' }, { countryCode: 'IN' }), 'international');
  assert.throws(
    () => determineRouteType({ countryCode: 'US' }, { countryCode: 'US' }),
    /domestic routes within India/,
  );
});

test('marks provider options using live price and delivery data', () => {
  const options = applyQuoteBadges([
    { providerKey: 'dhl', amount: 120, estimatedDeliveryAt: '2026-08-05T12:00:00Z', trackingAvailable: true, pickupAvailable: true },
    { providerKey: 'fedex', amount: 100, estimatedDeliveryAt: '2026-08-07T12:00:00Z', trackingAvailable: true, pickupAvailable: true },
  ]);

  assert.equal(options.find(item => item.providerKey === 'dhl').fastest, true);
  assert.equal(options.find(item => item.providerKey === 'fedex').bestPrice, true);
  assert.equal(options.filter(item => item.recommended).length, 1);
  assert.equal(options.find(item => item.providerKey === 'fedex').recommended, true);
});

test('requires international customs data and rejects incomplete dangerous-goods bookings', () => {
  const address = {
    contactName: 'Test User',
    phone: '9999999999',
    line1: '42 Industrial Area',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400001',
    country: 'India',
    countryCode: 'IN',
  };
  const input = {
    pickup: address,
    destination: { ...address, country: 'United Arab Emirates', countryCode: 'AE' },
    shipment: {
      description: 'Machine parts',
      quantity: 1,
      weightKg: 2,
      declaredValue: 100,
      currency: 'USD',
      contents: 'non_documents',
    },
  };

  assert.equal(providerSearchSchema.safeParse(input).success, false);
  assert.equal(providerSearchSchema.safeParse({
    ...input,
    shipment: { ...input.shipment, countryOfOrigin: 'IN' },
  }).success, true);
  const dangerous = providerSearchSchema.safeParse({
    ...input,
    shipment: { ...input.shipment, countryOfOrigin: 'IN', dangerousGoods: true },
  });
  assert.equal(dangerous.success, false);
  assert.match(dangerous.error.issues[0].message, /carrier-specific classification/);
});
