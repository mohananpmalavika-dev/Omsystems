'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseWebSocketOptions {
  tenantId: string;
  userId: string;
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
}

interface HealthUpdate {
  type: 'camera' | 'storage' | 'network' | 'ups';
  assetId: string;
  assetName: string;
  status: 'healthy' | 'warning' | 'critical' | 'offline';
  metrics: Record<string, any>;
  timestamp: string;
}

interface AlertUpdate {
  alertId: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  message: string;
  source: string;
  status: 'active' | 'acknowledged' | 'resolved';
  timestamp: string;
}

interface WorkOrderUpdate {
  workOrderId: string;
  workOrderNumber: string;
  status: string;
  assignedTo?: string;
  timestamp: string;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const {
    tenantId,
    userId,
    autoConnect = true,
    reconnection = true,
    reconnectionAttempts = 5,
    reconnectionDelay = 1000,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const [healthUpdates, setHealthUpdates] = useState<HealthUpdate[]>([]);
  const [alerts, setAlerts] = useState<AlertUpdate[]>([]);
  const [workOrderUpdates, setWorkOrderUpdates] = useState<WorkOrderUpdate[]>([]);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!autoConnect) return;

    const socketUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';

    const socket = io(socketUrl, {
      path: '/ws',
      transports: ['websocket', 'polling'],
      reconnection,
      reconnectionAttempts,
      reconnectionDelay,
      autoConnect: true,
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('WebSocket connected:', socket.id);
      setIsConnected(true);

      // Authenticate immediately after connection
      socket.emit('authenticate', { tenantId, userId });
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      setIsAuthenticated(false);
    });

    socket.on('authenticated', () => {
      console.log('WebSocket authenticated');
      setIsAuthenticated(true);
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setIsConnected(false);
      setIsAuthenticated(false);
    });

    // Health update events
    socket.on('health-update', (update: HealthUpdate) => {
      console.log('Health update received:', update);
      setHealthUpdates((prev) => [update, ...prev].slice(0, 100)); // Keep last 100 updates
    });

    // Alert events
    socket.on('alert', (alert: AlertUpdate) => {
      console.log('Alert received:', alert);
      setAlerts((prev) => [alert, ...prev].slice(0, 50)); // Keep last 50 alerts
    });

    // Work order update events
    socket.on('work-order-update', (update: WorkOrderUpdate) => {
      console.log('Work order update received:', update);
      setWorkOrderUpdates((prev) => [update, ...prev].slice(0, 50));
    });

    // System events
    socket.on('system-event', (event: { type: string; message: string; data?: any }) => {
      console.log('System event received:', event);
    });

    // Error events
    socket.on('error', (error: { message: string }) => {
      console.error('WebSocket error:', error);
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [autoConnect, tenantId, userId, reconnection, reconnectionAttempts, reconnectionDelay]);

  // Subscribe to a channel
  const subscribe = useCallback((channel: string) => {
    if (!socketRef.current || !isAuthenticated) {
      console.warn('Cannot subscribe: socket not connected or not authenticated');
      return;
    }

    socketRef.current.emit('subscribe', channel);
    console.log('Subscribed to channel:', channel);
  }, [isAuthenticated]);

  // Unsubscribe from a channel
  const unsubscribe = useCallback((channel: string) => {
    if (!socketRef.current || !isAuthenticated) return;

    socketRef.current.emit('unsubscribe', channel);
    console.log('Unsubscribed from channel:', channel);
  }, [isAuthenticated]);

  // Request current health status
  const requestHealthStatus = useCallback(() => {
    if (!socketRef.current || !isAuthenticated) return;

    socketRef.current.emit('request-health-status');
  }, [isAuthenticated]);

  // Clear health updates
  const clearHealthUpdates = useCallback(() => {
    setHealthUpdates([]);
  }, []);

  // Clear alerts
  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  // Clear work order updates
  const clearWorkOrderUpdates = useCallback(() => {
    setWorkOrderUpdates([]);
  }, []);

  // Manually connect
  const connect = useCallback(() => {
    if (socketRef.current && !socketRef.current.connected) {
      socketRef.current.connect();
    }
  }, []);

  // Manually disconnect
  const disconnect = useCallback(() => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.disconnect();
    }
  }, []);

  return {
    isConnected,
    isAuthenticated,
    healthUpdates,
    alerts,
    workOrderUpdates,
    subscribe,
    unsubscribe,
    requestHealthStatus,
    clearHealthUpdates,
    clearAlerts,
    clearWorkOrderUpdates,
    connect,
    disconnect,
  };
}
