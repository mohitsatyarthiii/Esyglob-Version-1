import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { connectRealtime, disconnectRealtime, safeSocketEmit, safeSocketOff, safeSocketOn } from './socket';

type Listener = (...args: any[]) => void;
type RealtimeContextValue = {
  socket: Socket | null;
  isConnected: boolean;
  connectionError: string | null;
  emit: (event: string, data?: unknown) => boolean;
  on: (event: string, callback: Listener) => boolean;
  off: (event: string, callback: Listener) => boolean;
};

const fallback: RealtimeContextValue = {
  socket: null,
  isConnected: false,
  connectionError: null,
  emit: () => false,
  on: () => false,
  off: () => false,
};
const RealtimeContext = createContext<RealtimeContextValue>(fallback);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const queryClient = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated' || !user) {
      disconnectRealtime();
      setSocket(null);
      setConnected(false);
      return undefined;
    }

    const instance = connectRealtime();
    if (!instance) {
      setConnectionError('Realtime service is unavailable.');
      return undefined;
    }
    setSocket(instance);

    const connected = () => { setConnected(true); setConnectionError(null); };
    const disconnected = () => setConnected(false);
    const failed = (error: Error) => { setConnected(false); setConnectionError(error?.message || 'Unable to connect realtime service.'); };
    const chats = () => queryClient.invalidateQueries({ queryKey: ['chats'] });
    const notifications = () => { queryClient.invalidateQueries({ queryKey: ['notification-center'] }); queryClient.invalidateQueries({ queryKey: ['account-notifications'] }); };
    const quotations = () => { queryClient.invalidateQueries({ queryKey: ['quotations'] }); queryClient.invalidateQueries({ queryKey: ['rfqs'] }); };
    const orders = () => queryClient.invalidateQueries({ queryKey: ['orders'] });

    instance.on('connect', connected);
    instance.on('disconnect', disconnected);
    instance.on('connect_error', failed);
    instance.on('new_message', chats);
    instance.on('conversation_updated', chats);
    instance.on('new_notification', notifications);
    instance.on('quotation_updated', quotations);
    instance.on('rfq_updated', quotations);
    instance.on('order_updated', orders);
    if (instance.connected) connected();

    return () => {
      instance.off('connect', connected);
      instance.off('disconnect', disconnected);
      instance.off('connect_error', failed);
      instance.off('new_message', chats);
      instance.off('conversation_updated', chats);
      instance.off('new_notification', notifications);
      instance.off('quotation_updated', quotations);
      instance.off('rfq_updated', quotations);
      instance.off('order_updated', orders);
      disconnectRealtime();
    };
  }, [queryClient, status, user]);

  const emit = useCallback((event: string, data?: unknown) => safeSocketEmit(event, data), []);
  const on = useCallback((event: string, callback: Listener) => safeSocketOn(event, callback), []);
  const off = useCallback((event: string, callback: Listener) => safeSocketOff(event, callback), []);
  const value = useMemo(() => ({ socket, isConnected, connectionError, emit, on, off }), [connectionError, emit, isConnected, off, on, socket]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  return useContext(RealtimeContext);
}

export default RealtimeProvider;
