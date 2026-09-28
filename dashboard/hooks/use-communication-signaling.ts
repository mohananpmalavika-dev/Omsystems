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
  sourceOperatorId?: string;
  targetBranchId?: string;
  targetEmployeeId?: string;
  context?: string;
  caller?: {
    type?: 'OPERATOR' | 'EMPLOYEE' | 'BRANCH_DEVICE';
    id?: string;
    name?: string;
    branchId?: string;
  };
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

export interface WebRtcSignalEvent {
  callId: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export interface CommunicationSignalingHook {
  socket: Socket | null;
  connected: boolean;
  
  // Event listeners
  onCallInvite: (handler: (event: CallInviteEvent) => void) => () => void;
  onCallRinging: (handler: (event: CallStatusEvent) => void) => () => void;
  onCallAccepted: (handler: (event: CallStatusEvent) => void) => () => void;
  onCallAcceptedElsewhere: (handler: (event: CallStatusEvent) => void) => () => void;
  onCallConnected: (handler: (event: CallStatusEvent) => void) => () => void;
  onCallReconnecting: (handler: (event: CallStatusEvent) => void) => () => void;
  onCallRejected: (handler: (event: CallStatusEvent) => void) => () => void;
  onCallCancelled: (handler: (event: CallStatusEvent) => void) => () => void;
  onCallEnded: (handler: (event: CallStatusEvent) => void) => () => void;
  onCallFailed: (handler: (event: CallStatusEvent) => void) => () => void;
  
  onMessageCreated: (handler: (event: MessageEvent) => void) => () => void;
  onMessageDelivered: (handler: (event: { messageId: string }) => void) => () => void;
  onMessageRead: (handler: (event: { messageId: string }) => void) => () => void;
  
  onPresenceChanged: (handler: (event: PresenceEvent) => void) => () => void;
  onWebRtcOffer: (handler: (event: WebRtcSignalEvent) => void) => () => void;
  onWebRtcAnswer: (handler: (event: WebRtcSignalEvent) => void) => () => void;
  onWebRtcIceCandidate: (handler: (event: WebRtcSignalEvent) => void) => () => void;
  onCallMediaReady: (handler: (event: { callId: string }) => void) => () => void;
  joinCall: (callId: string) => Promise<void>;
  sendWebRtcOffer: (callId: string, description: RTCSessionDescriptionInit) => void;
  sendWebRtcAnswer: (callId: string, description: RTCSessionDescriptionInit) => void;
  sendWebRtcIceCandidate: (callId: string, candidate: RTCIceCandidateInit) => void;
  sendCallMediaReady: (callId: string) => void;
  
  // Cleanup
  cleanup: () => void;
}

// ============================================================================
// HOOK
// ============================================================================

export function useCommunicationSignaling(identity: 'operator' | 'device' = 'operator'): CommunicationSignalingHook {
  const [connected, setConnected] = useState(false);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef<Map<string, Set<Function>>>(new Map());
  // React re-renders after an answer is accepted. Keep a small, in-memory
  // buffer so an offer/ICE candidate arriving during that handoff is not lost.
  const pendingCallSignalsRef = useRef<Map<string, unknown[]>>(new Map());

  const dispatchCallSignal = useCallback((eventType: string, event: unknown) => {
    const handlers = handlersRef.current.get(eventType);
    if (handlers?.size) {
      handlers.forEach(handler => handler(event));
      return;
    }
    const pending = pendingCallSignalsRef.current.get(eventType) || [];
    pending.push(event);
    // A disconnected or abandoned call must not grow this buffer indefinitely.
    pendingCallSignalsRef.current.set(eventType, pending.slice(-32));
  }, []);
  
  // Initialize Socket.IO connection
  useEffect(() => {
    const refreshDeviceToken = () => setDeviceToken(localStorage.getItem('commDeviceToken'));
    refreshDeviceToken();
    window.addEventListener('comm-device-enrolled', refreshDeviceToken);
    return () => window.removeEventListener('comm-device-enrolled', refreshDeviceToken);
  }, []);

  useEffect(() => {
    const token = typeof window !== 'undefined'
      ? (identity === 'device' ? deviceToken : sessionStorage.getItem('activityAccessToken') || sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken'))
      : null;
    
    if (!token) {
      console.warn('[CommunicationSignaling] No access token found, deferring connection');
      return;
    }
    
    // Connect to Socket.IO server
    const socket = io(process.env.NEXT_PUBLIC_WS_URL || window.location.origin, {
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
      
      // Device identity comes from the server-signed enrollment token. User
      // identity is supplied by the authenticated application session.
      const deviceId = localStorage.getItem('commDeviceId');
      const tenantId = localStorage.getItem('commTenantId');
      if (identity === 'device' && deviceId && tenantId && deviceToken) {
        socket.emit('comm:register-device', { deviceId, tenantId });
      } else {
        // The server derives the operator and tenant from the verified socket
        // token, so browser storage cannot claim a different identity.
        socket.emit('comm:register-operator');
      }
    });
    const presenceTimer = window.setInterval(() => {
      if (socket.connected && identity === 'operator') socket.emit('comm:operator-heartbeat');
    }, 20_000);

    socket.on('comm:device-registered', () => {
      localStorage.setItem('commDeviceStatus', 'ACTIVE');
      window.dispatchEvent(new Event('comm-device-ready'));
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
    
    socket.on('PRESENCE_CHANGED', (event: { entityType: string; entityId: string; status: CommunicationPresence }) => {
      const normalized = { entityType: event.entityType.toUpperCase(), entityId: event.entityId, presence: event.status } as PresenceEvent;
      handlersRef.current.get('presenceChanged')?.forEach(handler => handler(normalized));
    });
    socket.on('comm:webrtc:offer', (event: WebRtcSignalEvent) => {
      dispatchCallSignal('webrtcOffer', event);
    });
    socket.on('comm:webrtc:answer', (event: WebRtcSignalEvent) => {
      dispatchCallSignal('webrtcAnswer', event);
    });
    socket.on('comm:webrtc:ice', (event: WebRtcSignalEvent) => {
      dispatchCallSignal('webrtcIce', event);
    });
    socket.on('comm:call-media-ready', (event: { callId: string }) => {
      dispatchCallSignal('callMediaReady', event);
    });
    
    // Cleanup on unmount
    return () => {
      window.clearInterval(presenceTimer);
      console.log('[CommunicationSignaling] Cleaning up connection');
      socket.disconnect();
      socketRef.current = null;
      handlersRef.current.clear();
      pendingCallSignalsRef.current.clear();
    };
  }, [deviceToken, dispatchCallSignal, identity]);
  
  // Event registration helper
  const registerHandler = useCallback((eventType: string, handler: Function) => {
    if (!handlersRef.current.has(eventType)) {
      handlersRef.current.set(eventType, new Set());
    }
    handlersRef.current.get(eventType)!.add(handler);
    const pending = pendingCallSignalsRef.current.get(eventType);
    if (pending?.length) {
      pendingCallSignalsRef.current.delete(eventType);
      pending.forEach(event => handler(event));
    }
    
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

  const onWebRtcOffer = useCallback((handler: (event: WebRtcSignalEvent) => void) => registerHandler('webrtcOffer', handler), [registerHandler]);
  const onWebRtcAnswer = useCallback((handler: (event: WebRtcSignalEvent) => void) => registerHandler('webrtcAnswer', handler), [registerHandler]);
  const onWebRtcIceCandidate = useCallback((handler: (event: WebRtcSignalEvent) => void) => registerHandler('webrtcIce', handler), [registerHandler]);
  const onCallMediaReady = useCallback((handler: (event: { callId: string }) => void) => registerHandler('callMediaReady', handler), [registerHandler]);

  const joinCall = useCallback((callId: string) => new Promise<void>((resolve, reject) => {
    const socket = socketRef.current;
    if (!socket?.connected) return reject(new Error('Call signaling is offline'));
    socket.emit('comm:join-call', { callId }, (result: { ok?: boolean; error?: string }) => {
      if (result?.ok) resolve(); else reject(new Error(result?.error || 'Unable to join call signaling'));
    });
  }), []);
  const sendWebRtcOffer = useCallback((callId: string, description: RTCSessionDescriptionInit) => socketRef.current?.emit('comm:webrtc:offer', { callId, description }), []);
  const sendWebRtcAnswer = useCallback((callId: string, description: RTCSessionDescriptionInit) => socketRef.current?.emit('comm:webrtc:answer', { callId, description }), []);
  const sendWebRtcIceCandidate = useCallback((callId: string, candidate: RTCIceCandidateInit) => socketRef.current?.emit('comm:webrtc:ice', { callId, candidate }), []);
  const sendCallMediaReady = useCallback((callId: string) => socketRef.current?.emit('comm:call-media-ready', { callId }), []);
  
  const cleanup = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    handlersRef.current.clear();
    pendingCallSignalsRef.current.clear();
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
    onWebRtcOffer,
    onWebRtcAnswer,
    onWebRtcIceCandidate,
    onCallMediaReady,
    joinCall,
    sendWebRtcOffer,
    sendWebRtcAnswer,
    sendWebRtcIceCandidate,
    sendCallMediaReady,
    cleanup,
  };
}
