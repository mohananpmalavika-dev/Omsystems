'use client';

import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export interface RealtimeEvent {
  type: string;
  data: Record<string, any>;
  timestamp?: string;
  branchId?: string;
  region?: string;
  severity?: string;
}

interface UseRealtimeUpdatesOptions {
  channels: string[];
  autoConnect?: boolean;
  onUpdate: (event: RealtimeEvent) => void;
}

/**
 * Small authenticated Socket.IO adapter shared by operational monitoring hooks.
 * HTTP polling remains the source-of-truth fallback when no browser session is
 * available or the realtime endpoint cannot be reached.
 */
export function useRealtimeUpdates({
  channels,
  autoConnect = true,
  onUpdate,
}: UseRealtimeUpdatesOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const channelKey = channels.join(',');

  useEffect(() => {
    if (!autoConnect) return;
    const token = window.sessionStorage.getItem('sentinelSession');
    if (!token) return;

    const socket = io(process.env.NEXT_PUBLIC_WS_URL || window.location.origin, {
      path: '/ws',
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: true,
    });

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('subscribe', channels);
    });
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('connect_error', () => setIsConnected(false));
    socket.on('update', onUpdate);

    return () => {
      socket.emit('unsubscribe', channels);
      socket.disconnect();
      setIsConnected(false);
    };
  }, [autoConnect, channelKey, onUpdate]);

  return { isConnected };
}
