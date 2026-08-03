import assert from 'node:assert/strict';
import test from 'node:test';
import { createAddressSchema } from '../src/validators/address.validator.js';
import { updateLocationSchema } from '../src/validators/location.validator.js';

test('unified address accepts labels and GPS metadata', () => {
  const address = createAddressSchema.parse({
    fullName: 'Test Buyer', phone: '9999999999', country: 'India', state: 'Delhi', city: 'Delhi',
    countryCode: 'IN', postalCode: '110001', address: 'Connaught Place', addressLabel: 'Office', latitude: 28.63, longitude: 77.21,
  });
  assert.equal(address.addressLabel, 'Office');
  assert.equal(updateLocationSchema.parse({ latitude: 28.63, longitude: 77.21 }).latitude, 28.63);
});

test('address validation rejects empty country codes without requiring a postal code', () => {
  const base = {
    fullName: 'Test Buyer', phone: '9999999999', country: 'United Arab Emirates', state: 'Dubai', city: 'Dubai',
    address: 'Downtown Dubai', addressLabel: 'Home',
  };
  assert.throws(() => createAddressSchema.parse({ ...base, countryCode: '' }));
  assert.equal(createAddressSchema.parse({ ...base, countryCode: 'ae' }).countryCode, 'AE');
});
