import { useEffect, useRef, useCallback, useState } from 'react';
import { Platform, PermissionsAndroid, AppState, AppStateStatus } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  updateCurrentLocation,
  getCurrentLocation,
  updateLocationAddress,
  toggleLocationTracking,
  LocationCoordinates,
  LocationAddress,
} from '../api/account';
import { useAuth } from '../auth/AuthContext';

// ─── Types ──────────────────────────────────────────────────────────────

type GeoPosition = {
  coords: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
};

// ─── Config ─────────────────────────────────────────────────────────────

const LOCATION_CONFIG = {
  enableHighAccuracy: true,
  distanceFilter: 50,
  interval: 30000,
  fastestInterval: 15000,
  timeout: 20000,
};

// ─── Hook ───────────────────────────────────────────────────────────────

export function useLocationTracking() {
  const { status } = useAuth();
  const watchId = useRef<number | null>(null);
  const isTracking = useRef(false);
  const appState = useRef(AppState.currentState);
  const [isLocationEnabled, setIsLocationEnabled] = useState(false);

  const { data: savedLocation, refetch: refetchLocation } = useQuery({
    queryKey: ['current-location'],
    queryFn: getCurrentLocation,
    enabled: status === 'authenticated',
    staleTime: 30000,
  });

  const updateLocation = useMutation({ mutationFn: updateCurrentLocation });
  const updateAddress = useMutation({ mutationFn: updateLocationAddress });
  const toggleTracking = useMutation({ mutationFn: toggleLocationTracking });

  // ── Permission ──────────────────────────────────────────────────────

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'ios') {
      Geolocation.requestAuthorization();
      return true;
    }

    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message: 'EsyGlob needs your location to show nearby suppliers and calculate shipping costs.',
          buttonNeutral: 'Ask Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'Allow',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn('Permission error:', err);
      return false;
    }
  }, []);

  // ── Reverse Geocode ─────────────────────────────────────────────────

  const reverseGeocode = useCallback(async (latitude: number, longitude: number): Promise<LocationAddress | undefined> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
        { headers: { 'User-Agent': 'EsyGlob/1.0' } }
      );
      const data = await response.json();

      if (data?.address) {
        const addr = data.address;
        const address: LocationAddress = {
          formatted: data.display_name,
          street: `${addr.road || ''} ${addr.house_number || ''}`.trim(),
          city: addr.city || addr.town || addr.village || addr.suburb || '',
          state: addr.state || '',
          country: addr.country || '',
          postalCode: addr.postcode || '',
        };
        updateAddress.mutate(address);
        return address;
      }
    } catch (error) {
      console.warn('Reverse geocoding failed:', error);
    }
  }, [updateAddress]);

  // ── Position Handler ────────────────────────────────────────────────

  const handlePositionUpdate = useCallback((position: GeoPosition) => {
    const { latitude, longitude, accuracy, altitude, speed, heading } = position.coords;

    updateLocation.mutate({
      latitude,
      longitude,
      accuracy,
      altitude: altitude ?? undefined,
      speed: speed ?? undefined,
      heading: heading ?? undefined,
    });

    reverseGeocode(latitude, longitude);
  }, [updateLocation, reverseGeocode]);

  // ── Stop Tracking ───────────────────────────────────────────────────

  const stopTracking = useCallback(() => {
    if (watchId.current !== null) {
      Geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    isTracking.current = false;
    setIsLocationEnabled(false);
    toggleTracking.mutate(false);
  }, [toggleTracking]);

  // ── Start Tracking ──────────────────────────────────────────────────

  const startTracking = useCallback(async () => {
    if (isTracking.current) return;

    const hasPermission = await requestPermission();
    if (!hasPermission) {
      setIsLocationEnabled(false);
      return;
    }

    setIsLocationEnabled(true);
    isTracking.current = true;
    toggleTracking.mutate(true);

    watchId.current = Geolocation.watchPosition(
      handlePositionUpdate,
      (error) => {
        console.warn('Location error:', error.message);
        if (error.code === 1) {
          setIsLocationEnabled(false);
          stopTracking();
        }
      },
      LOCATION_CONFIG
    );
  }, [requestPermission, handlePositionUpdate, toggleTracking, stopTracking]);

  // ── Get Position Once ───────────────────────────────────────────────

  const getCurrentPositionOnce = useCallback(async (): Promise<LocationCoordinates | null> => {
    return new Promise((resolve) => {
      Geolocation.getCurrentPosition(
        (position: GeoPosition) => {
          const { latitude, longitude, accuracy, altitude, speed, heading } = position.coords;
          resolve({
            latitude,
            longitude,
            accuracy,
            altitude: altitude ?? undefined,
            speed: speed ?? undefined,
            heading: heading ?? undefined,
          });
        },
        (error) => {
          console.warn('Get current position error:', error);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    });
  }, []);

  // ── App State Listener ──────────────────────────────────────────────

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (status === 'authenticated') {
          startTracking();
        }
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [status, startTracking]);

  // ── Auth-based Start/Stop ───────────────────────────────────────────

  useEffect(() => {
    if (status === 'authenticated') {
      startTracking();
    } else {
      stopTracking();
    }
    return () => stopTracking();
  }, [status]);

  // ── Periodic Refresh ────────────────────────────────────────────────

  useEffect(() => {
    if (status !== 'authenticated') return;
    const interval = setInterval(() => refetchLocation(), 60000);
    return () => clearInterval(interval);
  }, [status, refetchLocation]);

  // ── Return ──────────────────────────────────────────────────────────

  return {
    currentLocation: savedLocation,
    isLocationEnabled,
    isTracking: isTracking.current,
    startTracking,
    stopTracking,
    getCurrentPositionOnce,
    refetchLocation,
  };
}