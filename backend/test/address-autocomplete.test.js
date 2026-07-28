import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodePlaceToken,
  encodePlaceToken,
  normalizeNominatimPlace,
  normalizePhotonFeature,
} from '../src/services/address-autocomplete.service.js';

test('normalizes Photon suggestions into the shared address shape', () => {
  const result = normalizePhotonFeature({
    geometry: { coordinates: [72.8777, 19.076] },
    properties: {
      osm_type: 'way', osm_id: 123, name: 'Fort', street: 'Mahatma Gandhi Road',
      city: 'Mumbai', district: 'Mumbai City', state: 'Maharashtra',
      country: 'India', countrycode: 'in', postcode: '400001',
    },
  });
  assert.equal(result.location.city, 'Mumbai');
  assert.equal(result.location.district, 'Mumbai City');
  assert.equal(result.location.countryCode, 'IN');
  assert.equal(result.osm.osmType, 'W');
});

test('uses signed stateless OSM tokens and rejects tampering', () => {
  const token = encodePlaceToken({ osmType: 'N', osmId: '99', latitude: 28.6139, longitude: 77.209 });
  assert.deepEqual(decodePlaceToken(token), { osmType: 'N', osmId: '99', latitude: 28.6139, longitude: 77.209 });
  assert.throws(() => decodePlaceToken(`${token.slice(0, -1)}x`), /valid address suggestion/);
});

test('normalizes Nominatim reverse results with district and coordinates', () => {
  const result = normalizeNominatimPlace({
    osm_type: 'node', osm_id: 42, lat: '25.2048', lon: '55.2708',
    display_name: 'Downtown Dubai, Dubai, United Arab Emirates',
    address: {
      road: 'Sheikh Mohammed bin Rashid Boulevard', city_district: 'Downtown Dubai',
      city: 'Dubai', state: 'Dubai', country: 'United Arab Emirates',
      country_code: 'ae', postcode: '00000',
    },
  });
  assert.equal(result.district, 'Downtown Dubai');
  assert.equal(result.countryCode, 'AE');
  assert.equal(result.longitude, 55.2708);
});
