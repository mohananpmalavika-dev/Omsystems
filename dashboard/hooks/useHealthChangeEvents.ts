/**
 * React Hook for Real-Time Health Change Events
 * 
 * Connects to WebSocket and provides real-time branch health updates.
 * Automatically updates local state when changes occur.
 */

import { useEffect, useCallback, useRef } from 'react';
import { getOperationalHealthSocket, HealthChangeEvent } from '../lib/websocket/operational-health-socket';
import { BranchMosaicItem } from '../types/operational-health.types';

/**
 * Hook for receiving real-time health change events
 */
export function useHealthChangeEvents(
  onHealthChange?: (event: HealthChangeEvent) => void
) {
  const socketRef = useRef(getOperationalHealthSocket());

  useEffect(() => {
    const socket = socketRef.current;

    // Connect to WebSocket
    socket.connect();

    // Subscribe to health changes
    const unsubscribe = socket.subscribe((event) => {
      console.log('Health change event:', event);
      onHealthChange?.(event);
    });

    // Cleanup on unmount
    return () => {
      unsubscribe();
    };
  }, [onHealthChange]);
}

/**
 * Hook that automatically updates branch mosaic with real-time changes
 */
export function useRealtimeBranchMosaic(
  branches: BranchMosaicItem[],
  setBranches: (branches: BranchMosaicItem[]) => void
) {
  const handleHealthChange = useCallback(
    (event: HealthChangeEvent) => {
      // Update the specific branch in the mosaic
      setBranches(
        branches.map((branch) => {
          if (branch.branchId === event.branchId) {
            return {
              ...branch,
              state: event.newState as any,
              score: event.newScore,
              reasonCodes: event.currentReasonCodes,
              primaryReason: event.data?.primaryReason,
            };
          }
          return branch;
        })
      );

      // Show notification for critical state changes
      if (event.eventType === 'CRITICAL_ENTERED') {
        showNotification(
          `${event.branchName} entered CRITICAL state`,
          'error'
        );
      } else if (event.eventType === 'CRITICAL_CLEARED') {
        showNotification(
          `${event.branchName} recovered from CRITICAL state`,
          'success'
        );
      }
    },
    [branches, setBranches]
  );

  useHealthChangeEvents(handleHealthChange);
}

/**
 * Show browser notification (if permitted)
 */
function showNotification(message: string, type: 'success' | 'error' | 'warning') {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Branch Health Update', {
      body: message,
      icon: type === 'error' ? '/icons/error.png' : '/icons/success.png',
    });
  }
}

/**
 * Request notification permissions
 */
export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
