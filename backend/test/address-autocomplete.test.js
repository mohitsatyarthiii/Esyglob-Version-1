import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGoogleGeocode, normalizeGooglePlace } from '../src/services/address-autocomplete.service.js';

const componentsNew = [
  { longText: '42', shortText: '42', types: ['street_number'] },
  { longText: 'Mahatma Gandhi Road', shortText: 'MG Road', types: ['route'] },
  { longText: 'Mumbai', shortText: 'Mumbai', types: ['locality'] },
  { longText: 'Mumbai City', shortText: 'Mumbai City', types: ['administrative_area_level_2'] },
  { longText: 'Maharashtra', shortText: 'MH', types: ['administrative_area_level_1'] },
  { longText: 'India', shortText: 'IN', types: ['country'] },
  { longText: '400001', shortText: '400001', types: ['postal_code'] },
];

test('normalizes Google Place Details into the existing shared address shape', () => {
  const result = normalizeGooglePlace({
    id: 'ChIJ1234567890', displayName: { text: 'Fort' },
    formattedAddress: '42 Mahatma Gandhi Road, Mumbai, Maharashtra 400001, India',
    addressComponents: componentsNew, location: { latitude: 19.076, longitude: 72.8777 },
  });
  assert.equal(result.line1, '42 Mahatma Gandhi Road');
  assert.equal(result.city, 'Mumbai');
  assert.equal(result.district, 'Mumbai City');
  assert.equal(result.countryCode, 'IN');
  assert.equal(result.longitude, 72.8777);
});

test('normalizes Google reverse-geocoding results with district and coordinates', () => {
  const componentsLegacy = [
    { long_name: 'Sheikh Mohammed bin Rashid Boulevard', short_name: 'Sheikh Mohammed bin Rashid Blvd', types: ['route'] },
    { long_name: 'Dubai', short_name: 'Dubai', types: ['locality'] },
    { long_name: 'Downtown Dubai', short_name: 'Downtown Dubai', types: ['administrative_area_level_2'] },
    { long_name: 'Dubai', short_name: 'Dubai', types: ['administrative_area_level_1'] },
    { long_name: 'United Arab Emirates', short_name: 'AE', types: ['country'] },
  ];
  const result = normalizeGoogleGeocode({
    place_id: 'ChIJ0987654321', formatted_address: 'Downtown Dubai, Dubai, United Arab Emirates',
    address_components: componentsLegacy,
    geometry: { location: { lat: 25.2048, lng: 55.2708 } },
  });
  assert.equal(result.district, 'Downtown Dubai');
  assert.equal(result.countryCode, 'AE');
  assert.equal(result.longitude, 55.2708);
});
