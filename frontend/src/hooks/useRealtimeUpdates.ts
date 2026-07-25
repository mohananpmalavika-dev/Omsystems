/**
 * React Hooks for Real-time Updates
 * Simplified WebSocket integration for dashboard components
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { getWebSocketClient, RealtimeEvent } from '../services/websocket-client';

/**
 * Hook for subscribing to real-time updates
 */
export function useRealtimeUpdates<T = any>(
  eventType: string | string[],
  onUpdate: (data: T) => void,
  options?: {
    enabled?: boolean;
    channels?: string[];
  }
) {
  const [isConnected, setIsConnected] = useState(false);
  const onUpdateRef = useRef(onUpdate);

  // Keep callback ref updated
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    const wsClient = getWebSocketClient();
    
    if (!wsClient || options?.enabled === false) {
      return;
    }

    setIsConnected(wsClient.connected);

    // Subscribe to channels
    if (options?.channels) {
      wsClient.subscribe(options.channels);
    }

    // Handle events
    const eventTypes = Array.isArray(eventType) ? eventType : [eventType];
    
    const handleEvent = (event: RealtimeEvent) => {
      if (eventTypes.includes(event.type) || eventTypes.includes('*')) {
        onUpdateRef.current(event.data);
      }
    };

    eventTypes.forEach(type => {
      wsClient.on(type, handleEvent);
    });

    // Cleanup
    return () => {
      eventTypes.forEach(type => {
        wsClient.off(type, handleEvent);
      });

      if (options?.channels) {
        wsClient.unsubscribe(options.channels);
      }
    };
  }, [eventType, options?.enabled, options?.channels]);

  return { isConnected };
}

/**
 * Hook for branch-specific real-time updates
 */
export function useBranchRealtimeUpdates(
  branchId: string,
  onUpdate: (event: RealtimeEvent) => void,
  options?: { enabled?: boolean }
) {
  return useRealtimeUpdates('*', onUpdate, {
    enabled: options?.enabled,
    channels: [`branch:${branchId}`]
  });
}

/**
 * Hook for alert updates
 */
export function useAlertUpdates(
  onAlert: (alert: any) => void,
  options?: { enabled?: boolean; severity?: string[] }
) {
  const handleUpdate = useCallback((alert: any) => {
    if (!options?.severity || options.severity.includes(alert.severity)) {
      onAlert(alert);
    }
  }, [onAlert, options?.severity]);

  return useRealtimeUpdates('alert', handleUpdate, {
    enabled: options?.enabled,
    channels: ['alerts']
  });
}

/**
 * Hook for incident updates
 */
export function useIncidentUpdates(
  onIncident: (incident: any) => void,
  options?: { enabled?: boolean }
) {
  return useRealtimeUpdates('incident', onIncident, {
    enabled: options?.enabled,
    channels: ['incidents']
  });
}

/**
 * Hook for camera status updates
 */
export function useCameraStatusUpdates(
  onCameraUpdate: (update: any) => void,
  branchId?: string,
  options?: { enabled?: boolean }
) {
  const channels = branchId ? ['cameras', `branch:${branchId}`] : ['cameras'];
  
  return useRealtimeUpdates('camera_status', onCameraUpdate, {
    enabled: options?.enabled,
    channels
  });
}

/**
 * Hook for branch health updates
 */
export function useBranchHealthUpdates(
  onHealthUpdate: (health: any) => void,
  branchId?: string,
  options?: { enabled?: boolean }
) {
  const channels = branchId ? ['branch-health', `branch:${branchId}`] : ['branch-health'];
  
  return useRealtimeUpdates('branch_health', onHealthUpdate, {
    enabled: options?.enabled,
    channels
  });
}

/**
 * Hook for edge agent status updates
 */
export function useEdgeAgentUpdates(
  onAgentUpdate: (status: any) => void,
  branchId?: string,
  options?: { enabled?: boolean }
) {
  const channels = branchId ? ['edge-agents', `branch:${branchId}`] : ['edge-agents'];
  
  return useRealtimeUpdates('edge_agent_status', onAgentUpdate, {
    enabled: options?.enabled,
    channels
  });
}

/**
 * Hook for dashboard metrics updates
 */
export function useDashboardMetrics(
  onMetricsUpdate: (metrics: any) => void,
  options?: { enabled?: boolean }
) {
  return useRealtimeUpdates('dashboard_metrics', onMetricsUpdate, {
    enabled: options?.enabled,
    channels: ['global-dashboard']
  });
}

/**
 * Hook for map updates
 */
export function useMapUpdates(
  onMapUpdate: (update: any) => void,
  options?: { enabled?: boolean }
) {
  return useRealtimeUpdates(['branch_health', 'alert', 'incident'], onMapUpdate, {
    enabled: options?.enabled,
    channels: ['map-updates']
  });
}
