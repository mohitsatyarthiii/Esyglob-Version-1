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
  const allowed = await hasLocationPermission() || (requestPermission && await RNLocation.requestPermission(permissionOptions));
  if (!allowed) throw new Error('Allow location access to use your current address.');
  await RNLocation.configure({ distanceFilter: 0, desiredAccuracy: { ios: 'best', android: 'highAccuracy' } });
  const position = await RNLocation.getLatestLocation({ timeout: 15_000 });
  if (!position) throw new Error('Unable to read your current location.');
  const location = await reverseAddressCoordinates(position.latitude, position.longitude);
  if (!location) throw new Error('No address was found for this location.');
  const result = { ...location, latitude: position.latitude, longitude: position.longitude };
  if (persist) {
    await updateCurrentAddress({
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      address: {
        formatted: location.formattedAddress,
        street: location.street || location.line1,
        city: location.city,
        state: location.state,
        country: location.country,
        postalCode: location.postalCode,
      },
    });
  }
  return result;
}
