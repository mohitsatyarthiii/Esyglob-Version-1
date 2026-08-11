import RNLocation from 'react-native-location';
import { reverseAddressCoordinates, StandardizedLocation, updateCurrentAddress } from '../api/account';

const permissionOptions = {
  ios: 'whenInUse' as const,
  android: {
    detail: 'fine' as const,
    rationale: {
      title: 'Use current location',
      message: 'EsyGlob uses your location once to select your delivery address.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    },
  },
};

export async function hasLocationPermission() {
  return RNLocation.checkPermission(permissionOptions);
}

export async function detectCurrentAddress({ requestPermission = true, persist = false } = {}): Promise<StandardizedLocation> {
  let allowed = false;
  try { allowed = await hasLocationPermission() || Boolean(requestPermission && await RNLocation.requestPermission(permissionOptions)); }
  catch { throw new Error('Unable to detect your location. Please select your location manually.'); }
  if (!allowed) throw new Error('Location permission was denied. Please select your location manually.');
  let position: Awaited<ReturnType<typeof RNLocation.getLatestLocation>>;
  try {
    await RNLocation.configure({ distanceFilter: 0, desiredAccuracy: { ios: 'best', android: 'highAccuracy' } });
    position = await RNLocation.getLatestLocation({ timeout: 15_000 });
  } catch { throw new Error('Unable to detect your location. Please select your location manually.'); }
  if (!position) throw new Error('Unable to detect your location. Please select your location manually.');
  let result: StandardizedLocation | undefined;
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const location = await reverseAddressCoordinates(position.latitude, position.longitude, attempt > 0);
      result = normalizeLocation(location, position.latitude, position.longitude);
      if (!missingAddressFields(result).length) break;
    }
  } catch { throw new Error('Unable to detect your location. Please select your location manually.'); }
  if (!result || missingAddressFields(result).length) {
    throw new Error('Unable to detect your location. Please select your location manually.');
  }
  if (persist) {
    await updateCurrentAddress({
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      address: {
        formatted: result.formattedAddress,
        street: result.street || result.line1,
        city: result.city,
        state: result.state,
        country: result.country,
        countryCode: result.countryCode,
        district: result.district,
        postalCode: result.postalCode,
        placeId: result.placeId,
      },
    });
  }
  return result;
}

function normalizeLocation(value: StandardizedLocation | undefined, latitude: number, longitude: number): StandardizedLocation {
  return {
    ...(value || { formattedAddress: '' }),
    latitude,
    longitude,
    formattedAddress: String(value?.formattedAddress || value?.line1 || '').trim(),
    countryCode: String(value?.countryCode || '').trim().toUpperCase(),
  };
}

function missingAddressFields(value: StandardizedLocation) {
  const missing: string[] = [];
  if (!Number.isFinite(value.latitude) || Number(value.latitude) < -90 || Number(value.latitude) > 90) missing.push('latitude');
  if (!Number.isFinite(value.longitude) || Number(value.longitude) < -180 || Number(value.longitude) > 180) missing.push('longitude');
  if (!/^[A-Z]{2}$/.test(String(value.countryCode || ''))) missing.push('countryCode');
  for (const field of ['country', 'state', 'city', 'formattedAddress'] as const) if (!String(value[field] || '').trim()) missing.push(field);
  return missing;
}
