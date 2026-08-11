import axios from 'axios';
import NodeCache from 'node-cache';

const TIMEOUT_MS = Number(process.env.ADDRESS_SERVICE_TIMEOUT_MS || 6500);
const CACHE_TTL_SECONDS = Number(process.env.ADDRESS_CACHE_TTL_SECONDS || 900);
const cache = new NodeCache({
  stdTTL: CACHE_TTL_SECONDS,
  checkperiod: Math.max(60, Math.floor(CACHE_TTL_SECONDS / 2)),
  useClones: false,
  maxKeys: Number(process.env.ADDRESS_CACHE_MAX_KEYS || 5000),
});

function apiKey() {
  const value = String(process.env.GOOGLE_PLACES_API_KEY || '').trim();
  if (!value) throw Object.assign(new Error('Address lookup is temporarily unavailable'), { statusCode: 503, code: 'ADDRESS_SERVICE_NOT_CONFIGURED' });
  return value;
}

class AddressAutocompleteService {
  static capabilities() {
    return {
      configured: Boolean(String(process.env.GOOGLE_PLACES_API_KEY || '').trim()),
      provider: 'google', autocomplete: 'google_places', geocoder: 'google_geocoding',
      attribution: 'Google', supportsReverseGeocoding: true,
    };
  }

  static async search(query = {}) {
    const input = String(query.input || '').trim();
    if (input.length < 3) return response([]);
    if (input.length > 180) throw Object.assign(new Error('Address search is too long'), { statusCode: 422 });
    const languageCode = normalizeLanguage(query.languageCode);
    const countryCodes = normalizeCountryCodes(query.countryCodes);
    const sessionToken = normalizeSessionToken(query.sessionToken);
    const cacheKey = `google-search:${sessionToken}:${languageCode}:${countryCodes.join(',')}:${input.toLocaleLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const body = { input, languageCode, ...(sessionToken ? { sessionToken } : {}), ...(countryCodes.length ? { includedRegionCodes: countryCodes } : {}) };
    const { data } = await axios.post('https://places.googleapis.com/v1/places:autocomplete', body, {
      timeout: TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey(),
        'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
      },
    });
    const suggestions = (data?.suggestions || []).flatMap(item => {
      const prediction = item?.placePrediction;
      if (!prediction?.placeId) return [];
      const label = prediction.text?.text || '';
      return [{
        placeId: prediction.placeId,
        label,
        primaryText: prediction.structuredFormat?.mainText?.text || label,
        secondaryText: prediction.structuredFormat?.secondaryText?.text || '',
      }];
    }).slice(0, 8);
    const result = response(suggestions);
    cache.set(cacheKey, result);
    return result;
  }

  static async resolve(query = {}) {
    const placeId = validPlaceId(query.placeId);
    const languageCode = normalizeLanguage(query.languageCode);
    const sessionToken = normalizeSessionToken(query.sessionToken);
    const cacheKey = `google-place:${languageCode}:${placeId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const { data } = await axios.get(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      timeout: TIMEOUT_MS,
      params: { languageCode, ...(sessionToken ? { sessionToken } : {}) },
      headers: {
        'X-Goog-Api-Key': apiKey(),
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,addressComponents,location',
      },
    });
    const result = { provider: 'google', attribution: 'Google', location: normalizeGooglePlace(data) };
    cache.set(cacheKey, result);
    return result;
  }

  static async reverse(query = {}) {
    const latitude = coordinate(query.latitude ?? query.lat, -90, 90, 'latitude');
    const longitude = coordinate(query.longitude ?? query.lon, -180, 180, 'longitude');
    const language = normalizeLanguage(query.languageCode);
    const cacheKey = `google-reverse:${language}:${latitude.toFixed(5)}:${longitude.toFixed(5)}`;
    const cached = query.refresh ? null : cache.get(cacheKey);
    if (cached) return cached;
    const { data } = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      timeout: TIMEOUT_MS,
      params: { latlng: `${latitude},${longitude}`, language, key: apiKey() },
    });
    if (data?.status !== 'OK' || !data.results?.length) {
      if (data?.status && data.status !== 'ZERO_RESULTS') throw Object.assign(new Error('Address lookup is temporarily unavailable'), { statusCode: 502, code: 'ADDRESS_PROVIDER_UNAVAILABLE' });
      throw Object.assign(new Error('No address was found for this location'), { statusCode: 404 });
    }
    const location = normalizeGoogleGeocode(data.results[0]);
    location.latitude = latitude;
    location.longitude = longitude;
    const result = { provider: 'google', attribution: 'Google', location };
    if (isCompleteLocation(location)) cache.set(cacheKey, result);
    return result;
  }
}

function response(suggestions) { return { provider: 'google', attribution: 'Google', suggestions }; }

function normalizeGooglePlace(place = {}) {
  const components = componentMap(place.addressComponents);
  return locationFromComponents({
    placeId: place.id,
    formattedAddress: place.formattedAddress,
    placeName: place.displayName?.text,
    components,
    latitude: place.location?.latitude,
    longitude: place.location?.longitude,
  });
}

function normalizeGoogleGeocode(place = {}) {
  const components = componentMap(place.address_components);
  return locationFromComponents({
    placeId: place.place_id,
    formattedAddress: place.formatted_address,
    components,
    latitude: place.geometry?.location?.lat,
    longitude: place.geometry?.location?.lng,
  });
}

function componentMap(values = []) {
  const result = {};
  for (const item of values || []) {
    const types = item.types || [];
    for (const type of types) result[type] = {
      long: item.longText || item.long_name || '', short: item.shortText || item.short_name || '',
    };
  }
  return result;
}

function locationFromComponents({ placeId = '', formattedAddress = '', placeName = '', components = {}, latitude, longitude }) {
  const number = (...types) => types.map(type => components[type]?.long).find(Boolean) || '';
  const route = number('route');
  const streetNumber = number('street_number');
  const line1 = [streetNumber, route].filter(Boolean).join(' ') || placeName || number('premise', 'subpremise', 'neighborhood');
  const city = number('locality', 'postal_town', 'administrative_area_level_3', 'sublocality_level_1');
  return {
    placeId, placeName: placeName || line1 || city, formattedAddress, line1, street: route || line1,
    city,
    district: number('administrative_area_level_2', 'sublocality_level_1'),
    state: number('administrative_area_level_1'),
    postalCode: number('postal_code'),
    country: number('country'),
    countryCode: String(components.country?.short || '').toUpperCase(),
    latitude: Number(latitude), longitude: Number(longitude),
  };
}

function validPlaceId(value) {
  const result = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{10,255}$/.test(result)) throw Object.assign(new Error('Select a valid address suggestion'), { statusCode: 422 });
  return result;
}
function coordinate(value, minimum, maximum, label) { const number = Number(value); if (!Number.isFinite(number) || number < minimum || number > maximum) throw Object.assign(new Error(`A valid ${label} is required`), { statusCode: 422 }); return number; }
function normalizeLanguage(value) { const language = String(value || 'en').trim().toLowerCase(); return /^[a-z]{2,3}(?:-[a-z]{2})?$/.test(language) ? language : 'en'; }
function normalizeCountryCodes(value) { return [...new Set(String(value || '').split(',').map(item => item.trim().toLowerCase()).filter(item => /^[a-z]{2}$/.test(item)))].slice(0, 15); }
function normalizeSessionToken(value) { const token = String(value || '').trim(); return /^[A-Za-z0-9_-]{1,128}$/.test(token) ? token : ''; }
function isCompleteLocation(location) { return Boolean(location?.formattedAddress && location?.city && location?.state && location?.country && /^[A-Z]{2}$/.test(String(location?.countryCode || ''))); }

export { normalizeGoogleGeocode, normalizeGooglePlace };
export default AddressAutocompleteService;
