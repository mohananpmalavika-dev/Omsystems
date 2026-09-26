/**
 * KryptoVision Connect - WebSocket Signaling Hook
 * 
 * Manages Socket.IO connection for real-time communication events:
 * - Call signaling (CALL_INVITE, CALL_ACCEPT, CALL_END, etc.)
 * - Message notifications
 * - Presence updates
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { CommunicationCallStatus, CommunicationPresence } from '@/services/communication-api';

// ============================================================================
// TYPES
// ============================================================================

export interface CallInviteEvent {
  callId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  sourceBranchId?: string;
  sourceBranchName?: string;
  sourceEmployeeId?: string;
  sourceEmployeeName?: string;
  targetBranchId?: string;
  targetEmployeeId?: string;
  context?: string;
}

export interface CallStatusEvent {
  callId: string;
  status: CommunicationCallStatus;
  answeredBy?: {
    deviceId?: string;
    operatorId?: string;
    employeeId?: string;
    employeeName?: string;
  };
  quality?: 'GOOD' | 'DEGRADED' | 'POOR';
  duration?: number;
  endReason?: string;
}

export interface MessageEvent {
  messageId: string;
  conversationId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface PresenceEvent {
  entityType: 'BRANCH' | 'EMPLOYEE' | 'OPERATOR';
  entityId: string;
  presence: CommunicationPresence;
}

export interface CommunicationSignalingHook {
  socket: Socket | null;
  connected: boolean;
  
  // Event listeners
  onCallInvite: (handler: (event: CallInviteEvent) => void) => void;
  onCallRinging: (handler: (event: CallStatusEvent) => void) => void;
  onCallAccepted: (handler: (event: CallStatusEvent) => void) => void;
  onCallAcceptedElsewhere: (handler: (event: CallStatusEvent) => void) => void;
  onCallConnected: (handler: (event: CallStatusEvent) => void) => void;
  onCallReconnecting: (handler: (event: CallStatusEvent) => void) => void;
  onCallRejected: (handler: (event: CallStatusEvent) => void) => void;
  onCallCancelled: (handler: (event: CallStatusEvent) => void) => void;
  onCallEnded: (handler: (event: CallStatusEvent) => void) => void;
  onCallFailed: (handler: (event: CallStatusEvent) => void) => void;
  
  onMessageCreated: (handler: (event: MessageEvent) => void) => void;
  onMessageDelivered: (handler: (event: { messageId: string }) => void) => void;
  onMessageRead: (handler: (event: { messageId: string }) => void) => void;
  
  onPresenceChanged: (handler: (event: PresenceEvent) => void) => void;
  
  // Cleanup
  cleanup: () => void;
}

// ============================================================================
// HOOK
// ============================================================================

export function useCommunicationSignaling(): CommunicationSignalingHook {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef<Map<string, Set<Function>>>(new Map());
  
  // Initialize Socket.IO connection
  useEffect(() => {
    const token = typeof window !== 'undefined'
      ? (sessionStorage.getItem('activityAccessToken') || sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken'))
      : null;
    
    if (!token) {
      console.warn('[CommunicationSignaling] No access token found, deferring connection');
      return;
    }
    
    // Connect to Socket.IO server
    const socket = io({
      path: '/ws',
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });
    
    socketRef.current = socket;
    
    // Connection events
    socket.on('connect', () => {
      console.log('[CommunicationSignaling] Connected to server');
      setConnected(true);
      
      // Subscribe to communication events
      socket.emit('comm:register-operator');
    });
    
    socket.on('disconnect', (reason) => {
      console.log('[CommunicationSignaling] Disconnected:', reason);
      setConnected(false);
    });
    
    socket.on('connect_error', (error) => {
      console.error('[CommunicationSignaling] Connection error:', error);
    });
    
    // Communication event listeners
    socket.on('comm:call:invite', (event: CallInviteEvent) => {
      console.log('[CommunicationSignaling] CALL_INVITE:', event);
      handlersRef.current.get('callInvite')?.forEach(handler => handler(event));
    });
    
    socket.on('comm:call:ringing', (event: CallStatusEvent) => {
      console.log('[CommunicationSignaling] CALL_RINGING:', event);
      handlersRef.current.get('callRinging')?.forEach(handler => handler(event));
    });
    
    socket.on('comm:call:accepted', (event: CallStatusEvent) => {
      console.log('[CommunicationSignaling] CALL_ACCEPTED:', event);
      handlersRef.current.get('callAccepted')?.forEach(handler => handler(event));
    });
    
    socket.on('comm:call:accepted-elsewhere', (event: CallStatusEvent) => {
      console.log('[CommunicationSignaling] CALL_ACCEPTED_ELSEWHERE:', event);
      handlersRef.current.get('callAcceptedElsewhere')?.forEach(handler => handler(event));
    });
    
    socket.on('comm:call:connected', (event: CallStatusEvent) => {
      console.log('[CommunicationSignaling] CALL_CONNECTED:', event);
      handlersRef.current.get('callConnected')?.forEach(handler => handler(event));
    });
    
    socket.on('comm:call:reconnecting', (event: CallStatusEvent) => {
      console.log('[CommunicationSignaling] CALL_RECONNECTING:', event);
      handlersRef.current.get('callReconnecting')?.forEach(handler => handler(event));
    });
    
    socket.on('comm:call:rejected', (event: CallStatusEvent) => {
      console.log('[CommunicationSignaling] CALL_REJECTED:', event);
      handlersRef.current.get('callRejected')?.forEach(handler => handler(event));
    });
    
    socket.on('comm:call:cancelled', (event: CallStatusEvent) => {
      console.log('[CommunicationSignaling] CALL_CANCELLED:', event);
      handlersRef.current.get('callCancelled')?.forEach(handler => handler(event));
    });
    
    socket.on('comm:call:ended', (event: CallStatusEvent) => {
      console.log('[CommunicationSignaling] CALL_ENDED:', event);
      handlersRef.current.get('callEnded')?.forEach(handler => handler(event));
    });
    
    socket.on('comm:call:failed', (event: CallStatusEvent) => {
      console.log('[CommunicationSignaling] CALL_FAILED:', event);
      handlersRef.current.get('callFailed')?.forEach(handler => handler(event));
    });
    
    socket.on('comm:message:created', (event: MessageEvent) => {
      console.log('[CommunicationSignaling] MESSAGE_CREATED:', event);
      handlersRef.current.get('messageCreated')?.forEach(handler => handler(event));
    });
    
    socket.on('comm:message:delivered', (event: { messageId: string }) => {
      handlersRef.current.get('messageDelivered')?.forEach(handler => handler(event));
    });
    
    socket.on('comm:message:read', (event: { messageId: string }) => {
      handlersRef.current.get('messageRead')?.forEach(handler => handler(event));
    });
    
    socket.on('comm:presence:changed', (event: PresenceEvent) => {
      console.log('[CommunicationSignaling] PRESENCE_CHANGED:', event);
      handlersRef.current.get('presenceChanged')?.forEach(handler => handler(event));
    });
    
    // Cleanup on unmount
    return () => {
      console.log('[CommunicationSignaling] Cleaning up connection');
      socket.disconnect();
      socketRef.current = null;
      handlersRef.current.clear();
    };
  }, []);
  
  // Event registration helper
  const registerHandler = useCallback((eventType: string, handler: Function) => {
    if (!handlersRef.current.has(eventType)) {
      handlersRef.current.set(eventType, new Set());
    }
    handlersRef.current.get(eventType)!.add(handler);
    
    // Return cleanup function
    return () => {
      handlersRef.current.get(eventType)?.delete(handler);
    };
  }, []);
  
  // Public API
  const onCallInvite = useCallback((handler: (event: CallInviteEvent) => void) => {
    return registerHandler('callInvite', handler);
  }, [registerHandler]);
  
  const onCallRinging = useCallback((handler: (event: CallStatusEvent) => void) => {
    return registerHandler('callRinging', handler);
  }, [registerHandler]);
  
  const onCallAccepted = useCallback((handler: (event: CallStatusEvent) => void) => {
    return registerHandler('callAccepted', handler);
  }, [registerHandler]);
  
  const onCallAcceptedElsewhere = useCallback((handler: (event: CallStatusEvent) => void) => {
    return registerHandler('callAcceptedElsewhere', handler);
  }, [registerHandler]);
  
  const onCallConnected = useCallback((handler: (event: CallStatusEvent) => void) => {
    return registerHandler('callConnected', handler);
  }, [registerHandler]);
  
  const onCallReconnecting = useCallback((handler: (event: CallStatusEvent) => void) => {
    return registerHandler('callReconnecting', handler);
  }, [registerHandler]);
  
  const onCallRejected = useCallback((handler: (event: CallStatusEvent) => void) => {
    return registerHandler('callRejected', handler);
  }, [registerHandler]);
  
  const onCallCancelled = useCallback((handler: (event: CallStatusEvent) => void) => {
    return registerHandler('callCancelled', handler);
  }, [registerHandler]);
  
  const onCallEnded = useCallback((handler: (event: CallStatusEvent) => void) => {
    return registerHandler('callEnded', handler);
  }, [registerHandler]);
  
  const onCallFailed = useCallback((handler: (event: CallStatusEvent) => void) => {
    return registerHandler('callFailed', handler);
  }, [registerHandler]);
  
  const onMessageCreated = useCallback((handler: (event: MessageEvent) => void) => {
    return registerHandler('messageCreated', handler);
  }, [registerHandler]);
  
  const onMessageDelivered = useCallback((handler: (event: { messageId: string }) => void) => {
    return registerHandler('messageDelivered', handler);
  }, [registerHandler]);
  
  const onMessageRead = useCallback((handler: (event: { messageId: string }) => void) => {
    return registerHandler('messageRead', handler);
  }, [registerHandler]);
  
  const onPresenceChanged = useCallback((handler: (event: PresenceEvent) => void) => {
    return registerHandler('presenceChanged', handler);
  }, [registerHandler]);
  
  const cleanup = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    handlersRef.current.clear();
  }, []);
  
  return {
    socket: socketRef.current,
    connected,
    onCallInvite,
    onCallRinging,
    onCallAccepted,
    onCallAcceptedElsewhere,
    onCallConnected,
    onCallReconnecting,
    onCallRejected,
    onCallCancelled,
    onCallEnded,
    onCallFailed,
    onMessageCreated,
    onMessageDelivered,
    onMessageRead,
    onPresenceChanged,
    cleanup,
  };
}
