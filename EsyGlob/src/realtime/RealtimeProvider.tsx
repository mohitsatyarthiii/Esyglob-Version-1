import React, { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import { Socket } from 'socket.io-client';
import { 
  connectRealtime, 
  disconnectRealtime, 
  getRealtimeSocket, 
  safeSocketEmit, 
  isSocketConnected,
  safeSocketOn,
  safeSocketOff
} from './socket';

interface RealtimeContextType {
  socket: Socket | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  emit: (event: string, data: any) => boolean;
  on: (event: string, callback: (...args: any[]) => void) => boolean;
  off: (event: string, callback: (...args: any[]) => void) => boolean;
}

interface RealtimeProviderProps {
  children: ReactNode;
}

const RealtimeContext = createContext<RealtimeContextType | null>(null);

export function RealtimeProvider({ children }: RealtimeProviderProps) {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const socketRef = useRef<Socket | null>(null);
  const listenersRef = useRef<Map<string, Set<(...args: any[]) => void>>>(new Map());

  const connect = useCallback((): void => {
    try {
      const socket = connectRealtime();
      socketRef.current = socket;
      
      if (socket && socket.connected) {
        setIsConnected(true);
        console.log('✅ Socket already connected');
      } else if (socket) {
        // Setup connection listeners
        const onConnect = () => {
          setIsConnected(true);
          console.log('✅ Socket connected');
        };
        
        const onDisconnect = () => {
          setIsConnected(false);
          console.log('🔌 Socket disconnected');
        };
        
        const onConnectError = (error: Error) => {
          console.error('❌ Socket connection error:', error?.message || error);
        };
        
        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('connect_error', onConnectError);
        
        // Store cleanup functions
        (socket as any).__cleanup = () => {
          socket.off('connect', onConnect);
          socket.off('disconnect', onDisconnect);
          socket.off('connect_error', onConnectError);
        };
        
        socket.connect();
        console.log('🔄 Connecting socket...');
      }
    } catch (error) {
      console.error('❌ Failed to connect socket:', error);
    }
  }, []);

  const disconnect = useCallback((): void => {
    try {
      // Clean up stored listeners
      listenersRef.current.clear();
      
      if (socketRef.current && (socketRef.current as any).__cleanup) {
        (socketRef.current as any).__cleanup();
      }
      
      disconnectRealtime();
      socketRef.current = null;
      setIsConnected(false);
      console.log('🔌 Socket disconnected and cleaned up');
    } catch (error) {
      console.error('❌ Failed to disconnect socket:', error);
    }
  }, []);

  const emit = useCallback((event: string, data: any): boolean => {
    return safeSocketEmit(event, data);
  }, []);

  const on = useCallback((event: string, callback: (...args: any[]) => void): boolean => {
    try {
      const socket = getRealtimeSocket();
      if (socket && typeof socket.on === 'function') {
        socket.on(event, callback);
        
        // Store listener for cleanup
        if (!listenersRef.current.has(event)) {
          listenersRef.current.set(event, new Set());
        }
        listenersRef.current.get(event)?.add(callback);
        
        return true;
      }
      return false;
    } catch (error) {
      console.warn(`⚠️ Failed to register listener for "${event}":`, error);
      return false;
    }
  }, []);

  const off = useCallback((event: string, callback: (...args: any[]) => void): boolean => {
    try {
      const socket = getRealtimeSocket();
      if (socket && typeof socket.off === 'function') {
        socket.off(event, callback);
        
        // Remove from stored listeners
        const eventListeners = listenersRef.current.get(event);
        if (eventListeners) {
          eventListeners.delete(callback);
          if (eventListeners.size === 0) {
            listenersRef.current.delete(event);
          }
        }
        
        return true;
      }
      return false;
    } catch (error) {
      console.warn(`⚠️ Failed to remove listener for "${event}":`, error);
      return false;
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, []);

  // Check connection status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const connected = isSocketConnected();
      if (connected !== isConnected) {
        setIsConnected(connected);
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isConnected]);

  const value: RealtimeContextType = {
    socket: socketRef.current,
    isConnected,
    connect,
    disconnect,
    emit,
    on,
    off,
  };

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextType {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
}