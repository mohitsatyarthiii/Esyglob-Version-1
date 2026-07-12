import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, PermissionsAndroid, Platform } from 'react-native';
import Geolocation, { GeoError, GeoPosition } from 'react-native-geolocation-service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrentLocation, updateCurrentLocation, updateLocationAddress } from '../api/account';
import { useAuth } from '../auth/AuthContext';

export type TrackedCoordinates = { latitude: number; longitude: number; accuracy?: number; altitude?: number; speed?: number; heading?: number };

async function requestPermission() {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, { title: 'Allow location access', message: 'EsyGlob uses your location to improve nearby supplier, shipping, and delivery experiences.', buttonPositive: 'Allow', buttonNegative: 'Not now' });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

function coordinates(position: GeoPosition): TrackedCoordinates {
  const value = position.coords;
  return { latitude: value.latitude, longitude: value.longitude, accuracy: value.accuracy ?? undefined, altitude: value.altitude ?? undefined, speed: value.speed ?? undefined, heading: value.heading ?? undefined };
}

async function reverseGeocode(value: TrackedCoordinates) {
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${value.latitude}&lon=${value.longitude}`, { headers: { Accept: 'application/json', 'User-Agent': 'EsyGlob-Mobile/1.0 (support@esyglob.com)' } });
  if (!response.ok) return;
  const result = await response.json();
  const address = result?.address;
  if (!address) return;
  await updateLocationAddress({ formatted: result.display_name ?? '', street: [address.house_number, address.road].filter(Boolean).join(' '), city: address.city ?? address.town ?? address.village ?? '', state: address.state ?? '', country: address.country ?? '', postalCode: address.postcode ?? '' });
}

export function useLocationTracking() {
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const watchId = useRef<number | null>(null);
  const lastSentAt = useRef(0);
  const [isTracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const location = useQuery({ queryKey: ['current-location'], queryFn: getCurrentLocation, enabled: status === 'authenticated', staleTime: 30_000 });

  const persist = useCallback(async (position: GeoPosition) => {
    if (Date.now() - lastSentAt.current < 29_000) return;
    lastSentAt.current = Date.now();
    const value = coordinates(position);
    try {
      await updateCurrentLocation(value);
      await reverseGeocode(value).catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: ['current-location'] });
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to save location.');
    }
  }, [queryClient]);

  const stopTracking = useCallback(() => {
    if (watchId.current != null) Geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setTracking(false);
  }, []);

  const startTracking = useCallback(async () => {
    if (watchId.current != null || status !== 'authenticated') return;
    try {
      if (!(await requestPermission())) { setError('Location permission was not granted.'); return; }
      watchId.current = Geolocation.watchPosition(persist, (nextError: GeoError) => setError(nextError.message), { enableHighAccuracy: true, distanceFilter: 0, interval: 30_000, fastestInterval: 30_000, useSignificantChanges: false });
      setTracking(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Location tracking is unavailable.');
      stopTracking();
    }
  }, [persist, status, stopTracking]);

  const getCurrentPositionOnce = useCallback(async (): Promise<TrackedCoordinates | null> => {
    if (!(await requestPermission())) return null;
    return new Promise(resolve => Geolocation.getCurrentPosition(position => resolve(coordinates(position)), () => resolve(null), { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 }));
  }, []);

  useEffect(() => {
    const handleState = (next: AppStateStatus) => next === 'active' && status === 'authenticated' ? startTracking() : stopTracking();
    const subscription = AppState.addEventListener('change', handleState);
    if (status === 'authenticated' && AppState.currentState === 'active') startTracking(); else stopTracking();
    return () => { subscription.remove(); stopTracking(); };
  }, [startTracking, status, stopTracking]);

  return { currentLocation: location.data, isLocationEnabled: isTracking, isTracking, error, startTracking, stopTracking, getCurrentPositionOnce, refetchLocation: location.refetch };
}

export function LocationTrackingManager() {
  useLocationTracking();
  return null;
}
