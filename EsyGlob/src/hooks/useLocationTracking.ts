import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAddresses } from '../api/account';
import { detectCurrentAddress, hasLocationPermission } from '../services/currentAddress';
import { useAuth } from '../auth/AuthContext';

// Compatibility name retained for installed clients. Location now selects the default Address.
export function useLocationTracking({ autoDetect = true } = {}) {
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const attempted = useRef(false);
  const [isTracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: fetchAddresses, enabled: status === 'authenticated' });

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['addresses'] }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      queryClient.invalidateQueries({ queryKey: ['sellers'] }),
      queryClient.invalidateQueries({ queryKey: ['services'] }),
      queryClient.invalidateQueries({ queryKey: ['home-featured-products'] }),
      queryClient.invalidateQueries({ queryKey: ['home-latest-products'] }),
      queryClient.invalidateQueries({ queryKey: ['home-products-feed'] }),
      queryClient.invalidateQueries({ queryKey: ['manufacturers-directory'] }),
      queryClient.invalidateQueries({ queryKey: ['sellers-module'] }),
      queryClient.invalidateQueries({ queryKey: ['service-quote'] }),
    ]);
  }, [queryClient]);

  const detect = useCallback(async (requestPermission = true) => {
    setTracking(true);
    try {
      const location = await detectCurrentAddress({ requestPermission, persist: true });
      await refresh();
      setError(null);
      return { latitude: location.latitude!, longitude: location.longitude! };
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to save current address.');
      return null;
    } finally { setTracking(false); }
  }, [refresh]);

  useEffect(() => {
    if (!autoDetect || status !== 'authenticated' || attempted.current) return;
    attempted.current = true;
    hasLocationPermission().then(granted => granted ? detect(false) : null).catch(() => undefined);
  }, [autoDetect, detect, status]);

  const selected = addresses.data?.find(item => item.isDefault) || addresses.data?.[0];
  return {
    currentLocation: selected ? { address: selected, location: selected } : null,
    isLocationEnabled: Boolean(selected?.latitude && selected?.longitude),
    isTracking,
    error,
    startTracking: () => detect(true),
    stopTracking: () => undefined,
    getCurrentPositionOnce: () => detect(true),
    refetchLocation: addresses.refetch,
    refreshAddressDependentData: refresh,
  };
}

export function LocationTrackingManager() {
  useLocationTracking();
  return null;
}
