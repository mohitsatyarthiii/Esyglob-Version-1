import assert from 'node:assert/strict';
import test from 'node:test';
import { createAddressSchema } from '../src/validators/address.validator.js';
import { updateLocationSchema } from '../src/validators/location.validator.js';

test('unified address accepts labels and GPS metadata', () => {
  const address = createAddressSchema.parse({
    fullName: 'Test Buyer', phone: '9999999999', country: 'India', state: 'Delhi', city: 'Delhi',
    postalCode: '110001', address: 'Connaught Place', addressLabel: 'Office', latitude: 28.63, longitude: 77.21,
  });
  assert.equal(address.addressLabel, 'Office');
  assert.equal(updateLocationSchema.parse({ latitude: 28.63, longitude: 77.21 }).latitude, 28.63);
});
