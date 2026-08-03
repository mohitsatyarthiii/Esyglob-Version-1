import axios from 'axios';
import NodeCache from 'node-cache';
import crypto from 'node:crypto';

const TIMEOUT_MS = Number(process.env.ADDRESS_SERVICE_TIMEOUT_MS || 6500);
const CACHE_TTL_SECONDS = Number(process.env.ADDRESS_CACHE_TTL_SECONDS || 900);
const cache = new NodeCache({
  stdTTL: CACHE_TTL_SECONDS,
  checkperiod: Math.max(60, Math.floor(CACHE_TTL_SECONDS / 2)),
  useClones: false,
  maxKeys: Number(process.env.ADDRESS_CACHE_MAX_KEYS || 5000),
});

function configuredUrl(name) {
  const raw = String(process.env[name] || '').trim().replace(/\/+$/, '');
  if (!raw) {
    throw Object.assign(new Error('The self-hosted address service is not configured'), {
      statusCode: 503,
      code: 'ADDRESS_SERVICE_NOT_CONFIGURED',
    });
  }
  let parsed;
  try { parsed = new URL(raw); } catch {
    throw Object.assign(new Error(`${name} must be a valid HTTP(S) URL`), { statusCode: 503 });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw Object.assign(new Error(`${name} must use HTTP or HTTPS`), { statusCode: 503 });
  }
  const forbiddenPublicHosts = ['photon.komoot.io', 'nominatim.openstreetmap.org'];
  if (forbiddenPublicHosts.includes(parsed.hostname.toLowerCase())) {
    throw Object.assign(new Error(`${name} must point to the private EsyGlob geocoding stack`), { statusCode: 503 });
  }
  return raw;
}

function serviceClient(name) {
  return axios.create({
    baseURL: configuredUrl(name),
    timeout: TIMEOUT_MS,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'EsyGlob-Address-Service/1.0',
    },
  });
}

class AddressAutocompleteService {
  static capabilities() {
    return {
      configured: Boolean(process.env.PHOTON_BASE_URL && process.env.NOMINATIM_BASE_URL),
      provider: 'esyglob_osm',
      autocomplete: 'photon',
      geocoder: 'nominatim',
      attribution: '© OpenStreetMap contributors',
      supportsReverseGeocoding: true,
    };
  }

  static async search(query = {}) {
    const input = String(query.input || '').trim();
    if (input.length < 3) return response([]);
    if (input.length > 180) throw Object.assign(new Error('Address search is too long'), { statusCode: 422 });

    const language = normalizeLanguage(query.languageCode);
    const countryCodes = normalizeCountryCodes(query.countryCodes);
    const cacheKey = `search:${language}:${countryCodes.join(',')}:${input.toLocaleLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const params = { q: input, limit: 8, lang: language };
    if (countryCodes.length === 1) params.location_bias_scale = 0;
    const { data } = await serviceClient('PHOTON_BASE_URL').get('/api', { params });
    const suggestions = (data?.features || [])
      .map(normalizePhotonFeature)
      .filter(item => item && (!countryCodes.length || countryCodes.includes(item.location.countryCode.toLowerCase())))
      .slice(0, 8)
      .map(({ location, osm }) => ({
        placeId: encodePlaceToken({ ...osm, latitude: location.latitude, longitude: location.longitude }),
        label: location.formattedAddress,
        primaryText: location.placeName || location.line1 || location.city || location.formattedAddress,
        secondaryText: [location.city, location.state, location.country, location.postalCode].filter(Boolean).join(', '),
        city: location.city,
        district: location.district,
        state: location.state,
        country: location.country,
        postalCode: location.postalCode,
      }));
    const result = response(suggestions);
    cache.set(cacheKey, result);
    return result;
  }

  static async resolve(query = {}) {
    const token = decodePlaceToken(query.placeId);
    const cacheKey = `resolve:${query.placeId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const params = {
      format: 'jsonv2',
      addressdetails: 1,
      'accept-language': normalizeLanguage(query.languageCode),
    };
    let data;
    if (token.osmType && token.osmId) {
      const result = await serviceClient('NOMINATIM_BASE_URL').get('/lookup', {
        params: { ...params, osm_ids: `${token.osmType}${token.osmId}` },
      });
      data = result.data?.[0];
    }
    if (!data) {
      const result = await serviceClient('NOMINATIM_BASE_URL').get('/reverse', {
        params: { ...params, lat: token.latitude, lon: token.longitude, zoom: 18 },
      });
      data = result.data;
    }
    const result = {
      provider: 'esyglob_osm',
      attribution: '© OpenStreetMap contributors',
      location: normalizeNominatimPlace(data, query.placeId),
    };
    cache.set(cacheKey, result);
    return result;
  }

  static async reverse(query = {}) {
    const latitude = coordinate(query.latitude ?? query.lat, -90, 90, 'latitude');
    const longitude = coordinate(query.longitude ?? query.lon, -180, 180, 'longitude');
    const language = normalizeLanguage(query.languageCode);
    const cacheKey = `reverse:${language}:${latitude.toFixed(5)}:${longitude.toFixed(5)}`;
    const cached = query.refresh ? null : cache.get(cacheKey);
    if (cached) return cached;
    const { data } = await serviceClient('NOMINATIM_BASE_URL').get('/reverse', {
      params: {
        lat: latitude,
        lon: longitude,
        format: 'jsonv2',
        addressdetails: 1,
        zoom: 18,
        'accept-language': language,
      },
    });
    if (!data || data.error) throw Object.assign(new Error('No address was found for this location'), { statusCode: 404 });
    const result = {
      provider: 'esyglob_osm',
      attribution: '© OpenStreetMap contributors',
      location: normalizeNominatimPlace(data),
    };
    if (isCompleteLocation(result.location)) cache.set(cacheKey, result);
    return result;
  }
}

function response(suggestions) {
  return {
    provider: 'esyglob_osm',
    attribution: '© OpenStreetMap contributors',
    suggestions,
  };
}

function normalizePhotonFeature(feature) {
  const properties = feature?.properties || {};
  const [longitude, latitude] = feature?.geometry?.coordinates || [];
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return null;
  const placeName = properties.name || properties.street || properties.city || properties.locality || '';
  const line1 = [properties.housenumber, properties.street].filter(Boolean).join(' ') || placeName;
  const city = properties.city || properties.town || properties.village || properties.locality || '';
  const district = properties.district || properties.county || properties.localadmin || '';
  const state = properties.state || properties.region || '';
  const country = properties.country || '';
  const postalCode = properties.postcode || '';
  const parts = unique([line1, district, city, state, postalCode, country]);
  return {
    osm: {
      osmType: normalizeOsmType(properties.osm_type),
      osmId: String(properties.osm_id || ''),
    },
    location: {
      placeName,
      formattedAddress: parts.join(', '),
      line1,
      street: properties.street || line1,
      city,
      district,
      state,
      country,
      countryCode: String(properties.countrycode || properties.country_code || '').toUpperCase(),
      postalCode,
      latitude: Number(latitude),
      longitude: Number(longitude),
    },
  };
}

function normalizeNominatimPlace(place, placeId = '') {
  if (!place) throw Object.assign(new Error('The selected address is no longer available'), { statusCode: 404 });
  const address = place.address || {};
  const road = address.road || address.pedestrian || address.footway || address.path || '';
  const line1 = [address.house_number, road].filter(Boolean).join(' ')
    || address.building || address.amenity || address.shop || place.name || '';
  const city = address.city || address.town || address.village || address.municipality || address.locality || '';
  const district = address.city_district || address.district || address.county || address.state_district || '';
  return {
    placeId: placeId || encodePlaceToken({
      osmType: normalizeOsmType(place.osm_type),
      osmId: String(place.osm_id || ''),
      latitude: Number(place.lat),
      longitude: Number(place.lon),
    }),
    placeName: place.name || line1 || city,
    formattedAddress: place.display_name || unique([line1, district, city, address.state, address.postcode, address.country]).join(', '),
    line1,
    street: road || line1,
    city,
    district,
    state: address.state || address.region || '',
    postalCode: address.postcode || '',
    country: address.country || '',
    countryCode: String(address.country_code || '').toUpperCase(),
    latitude: Number(place.lat),
    longitude: Number(place.lon),
  };
}

function encodePlaceToken(value) {
  const body = Buffer.from(JSON.stringify(value)).toString('base64url');
  const signature = crypto.createHash('sha256')
    .update(`${body}:${process.env.ADDRESS_TOKEN_SECRET || process.env.JWT_SECRET || 'esyglob-address'}`)
    .digest('base64url')
    .slice(0, 16);
  return `osm.${body}.${signature}`;
}

function decodePlaceToken(value) {
  const match = /^osm\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{16})$/.exec(String(value || '').trim());
  if (!match) throw Object.assign(new Error('Select a valid address suggestion'), { statusCode: 422 });
  const expected = crypto.createHash('sha256')
    .update(`${match[1]}:${process.env.ADDRESS_TOKEN_SECRET || process.env.JWT_SECRET || 'esyglob-address'}`)
    .digest('base64url')
    .slice(0, 16);
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(match[2]))) {
    throw Object.assign(new Error('Select a valid address suggestion'), { statusCode: 422 });
  }
  try {
    const parsed = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
    return {
      osmType: normalizeOsmType(parsed.osmType),
      osmId: /^\d+$/.test(String(parsed.osmId || '')) ? String(parsed.osmId) : '',
      latitude: coordinate(parsed.latitude, -90, 90, 'latitude'),
      longitude: coordinate(parsed.longitude, -180, 180, 'longitude'),
    };
  } catch (error) {
    if (error.statusCode) throw error;
    throw Object.assign(new Error('Select a valid address suggestion'), { statusCode: 422 });
  }
}

function coordinate(value, minimum, maximum, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw Object.assign(new Error(`A valid ${label} is required`), { statusCode: 422 });
  }
  return number;
}

function normalizeLanguage(value) {
  const language = String(value || 'en').trim().toLowerCase();
  return /^[a-z]{2,3}(?:-[a-z]{2})?$/.test(language) ? language : 'en';
}

function normalizeCountryCodes(value) {
  return [...new Set(String(value || '').split(',').map(item => item.trim().toLowerCase()).filter(item => /^[a-z]{2}$/.test(item)))].slice(0, 15);
}

function normalizeOsmType(value) {
  return ({ node: 'N', way: 'W', relation: 'R', N: 'N', W: 'W', R: 'R' })[value] || '';
}

function unique(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function isCompleteLocation(location) {
  return Boolean(
    location?.formattedAddress
    && location?.city
    && location?.state
    && location?.country
    && /^[A-Z]{2}$/.test(String(location?.countryCode || ''))
  );
}

export {
  decodePlaceToken,
  encodePlaceToken,
  normalizeNominatimPlace,
  normalizePhotonFeature,
};
export default AddressAutocompleteService;
