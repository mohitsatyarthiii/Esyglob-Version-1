import { io, Socket } from 'socket.io-client';
import { config } from '../config/env';
import { getSessionToken } from '../api/client';

let socket: Socket | null = null;

export function getRealtimeSocket() {
  if (!socket) {
    socket = io(config.socketBaseUrl, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 750,
      reconnectionDelayMax: 8000,
      timeout: 15000,
    });
  }
  return socket;
}

export function connectRealtime() {
  const instance = getRealtimeSocket();
  instance.auth = { token: getSessionToken() };
  if (!instance.connected) instance.connect();
  return instance;
}

export function disconnectRealtime() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}
