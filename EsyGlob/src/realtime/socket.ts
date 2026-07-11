import { io, Socket } from 'socket.io-client';
import { config } from '../config/env';
import { getSessionToken } from '../api/client';

let socket: Socket | null = null;
let connectionAttempts: number = 0;
const MAX_RECONNECT_ATTEMPTS: number = 10;

export function getRealtimeSocket(): Socket | null {
  if (!socket) {
    const token = getSessionToken();
    
    socket = io(config.socketBaseUrl || config.apiBaseUrl, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 15000,
      auth: {
        token: token,
      },
      query: {
        token: token,
      },
    });

    // Connection event handlers
    socket.on('connect', () => {
      console.log('🟢 Socket connected:', socket?.id);
      connectionAttempts = 0;
    });

    socket.on('connect_error', (error: Error) => {
      console.error('🔴 Socket connection error:', error.message);
      connectionAttempts++;
      
      if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.warn('⚠️ Max reconnection attempts reached');
        socket?.disconnect();
      }
    });

    socket.on('disconnect', (reason: string) => {
      console.log('🟡 Socket disconnected:', reason);
    });

    socket.on('reconnect', (attemptNumber: number) => {
      console.log('🔄 Socket reconnected after', attemptNumber, 'attempts');
    });

    socket.on('reconnect_error', (error: Error) => {
      console.error('🔴 Socket reconnection error:', error.message);
    });
  }
  
  return socket;
}

export function connectRealtime(): Socket | null {
  try {
    const instance = getRealtimeSocket();
    
    if (!instance) {
      console.error('❌ Failed to get socket instance');
      return null;
    }
    
    // Update auth token
    const token = getSessionToken();
    if (token) {
      instance.auth = { token };
    }
    
    // Connect if not already connected
    if (!instance.connected) {
      instance.connect();
      console.log('🔄 Connecting socket...');
    }
    
    return instance;
  } catch (error) {
    console.error('❌ Failed to connect socket:', error);
    return null;
  }
}

export function disconnectRealtime(): void {
  try {
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
      console.log('🔌 Socket disconnected and cleaned up');
    }
  } catch (error) {
    console.error('❌ Failed to disconnect socket:', error);
  }
}

export function isSocketConnected(): boolean {
  try {
    return !!(socket && socket.connected);
  } catch {
    return false;
  }
}

export function safeSocketEmit(event: string, data: any): boolean {
  try {
    const instance = getRealtimeSocket();
    if (instance && instance.connected && typeof instance.emit === 'function') {
      instance.emit(event, data);
      return true;
    } else {
      console.warn(`⚠️ Socket not ready, cannot emit "${event}"`);
      return false;
    }
  } catch (error) {
    console.warn(`⚠️ Failed to emit "${event}":`, error instanceof Error ? error.message : error);
    return false;
  }
}

export function safeSocketOn(event: string, callback: (...args: any[]) => void): boolean {
  try {
    const instance = getRealtimeSocket();
    if (instance && typeof instance.on === 'function') {
      instance.on(event, callback);
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`⚠️ Failed to register listener for "${event}":`, error instanceof Error ? error.message : error);
    return false;
  }
}

export function safeSocketOff(event: string, callback: (...args: any[]) => void): boolean {
  try {
    const instance = getRealtimeSocket();
    if (instance && typeof instance.off === 'function') {
      instance.off(event, callback);
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`⚠️ Failed to remove listener for "${event}":`, error instanceof Error ? error.message : error);
    return false;
  }
}
