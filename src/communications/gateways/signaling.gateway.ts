/**
 * Communication Signaling Gateway
 * 
 * Provides real-time WebSocket signaling for calls and messages.
 * Extends existing WebSocketService with communication-specific events.
 * 
 * Core responsibilities:
 * - Broadcast call events (INVITE, RINGING, ACCEPT, END, etc.)
 * - Broadcast message events (CREATED, DELIVERED, READ)
 * - Broadcast presence changes
 * - Handle first-answer-wins coordination
 * - Route events to specific devices/operators
 * 
 * Event types:
 * - CALL_INVITE: New incoming call
 * - CALL_RINGING: Call is ringing
 * - CALL_ACCEPT: Call accepted
 * - CALL_ACCEPTED_ELSEWHERE: Another device accepted
 * - CALL_REJECT: Call rejected
 * - CALL_CANCEL: Call cancelled
 * - CALL_END: Call ended
 * - CALL_FAILED: Call failed
 * - MESSAGE_CREATED: New message
 * - MESSAGE_DELIVERED: Message delivered
 * - MESSAGE_READ: Message read
 * - PRESENCE_CHANGED: Device/operator presence changed
 */

import type { Server as SocketIOServer } from 'socket.io';
import type { Socket } from 'socket.io';
import type {
  CallSession,
  Message,
  CommunicationPresence,
  CallSignalingEvent,
  MessageSignalingEvent,
  PresenceSignalingEvent,
} from '../domain/types.js';
import { WEBSOCKET_EVENTS, WEBSOCKET_ROOMS } from '../domain/constants.js';

/**
 * Communication Signaling Gateway
 */
export class CommunicationSignalingGateway {
  constructor(private readonly io: SocketIOServer) {
    this.setupCommunicationHandlers();
  }

  /**
   * Setup communication-specific event handlers
   */
  private setupCommunicationHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      // Join device-specific room after authentication
      socket.on('comm:register-device', (data: { deviceId: string; tenantId: string }) => {
        const { deviceId, tenantId } = data;

        if (!socket.data.tenantId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        // Verify tenant matches
        if (socket.data.tenantId !== tenantId) {
          socket.emit('error', { message: 'Tenant mismatch' });
          return;
        }

        // Join device room
        socket.join(WEBSOCKET_ROOMS.DEVICE(tenantId, deviceId));
        socket.data.deviceId = deviceId;

        socket.emit('comm:device-registered', { deviceId });
      });

      // Join operator communication room
      socket.on('comm:register-operator', (data: { operatorId: string; tenantId: string }) => {
        const { operatorId, tenantId } = data;

        if (!socket.data.tenantId || socket.data.tenantId !== tenantId) {
          socket.emit('error', { message: 'Authentication failed' });
          return;
        }

        // Join operator room
        socket.join(WEBSOCKET_ROOMS.OPERATOR(tenantId, operatorId));
        socket.data.operatorId = operatorId;

        socket.emit('comm:operator-registered', { operatorId });
      });

      // Subscribe to branch room (for branch-wide calls)
      socket.on('comm:subscribe-branch', (data: { branchId: string }) => {
        const { branchId } = data;

        if (!socket.data.tenantId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        socket.join(WEBSOCKET_ROOMS.BRANCH(socket.data.tenantId, branchId));
        socket.emit('comm:branch-subscribed', { branchId });
      });

      // Subscribe to employee room
      socket.on('comm:subscribe-employee', (data: { employeeId: string }) => {
        const { employeeId } = data;

        if (!socket.data.tenantId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        socket.join(WEBSOCKET_ROOMS.EMPLOYEE(socket.data.tenantId, employeeId));
        socket.emit('comm:employee-subscribed', { employeeId });
      });

      // Subscribe to conversation
      socket.on('comm:subscribe-conversation', (data: { conversationId: string }) => {
        const { conversationId } = data;

        if (!socket.data.tenantId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        socket.join(WEBSOCKET_ROOMS.CONVERSATION(socket.data.tenantId, conversationId));
        socket.emit('comm:conversation-subscribed', { conversationId });
      });
    });
  }

  /**
   * Broadcast call invite to target devices/operators
   * 
   * Used when initiating a call to ring all eligible endpoints.
   * 
   * @param tenantId - Tenant ID
   * @param targetDeviceIds - Device IDs to ring
   * @param targetOperatorIds - Operator IDs to ring
   * @param call - Call session
   */
  broadcastCallInvite(
    tenantId: string,
    targetDeviceIds: string[],
    targetOperatorIds: string[],
    call: CallSession
  ): void {
    const event: CallSignalingEvent = {
      type: WEBSOCKET_EVENTS.CALL_INVITE,
      callId: call.id,
      call,
      timestamp: new Date().toISOString(),
    };

    // Send to each target device
    for (const deviceId of targetDeviceIds) {
      this.io.to(WEBSOCKET_ROOMS.DEVICE(tenantId, deviceId)).emit(
        WEBSOCKET_EVENTS.CALL_INVITE,
        event
      );
    }

    // Send to each target operator
    for (const operatorId of targetOperatorIds) {
      this.io.to(WEBSOCKET_ROOMS.OPERATOR(tenantId, operatorId)).emit(
        WEBSOCKET_EVENTS.CALL_INVITE,
        event
      );
    }
  }

  /**
   * Broadcast call ringing status
   * 
   * @param tenantId - Tenant ID
   * @param call - Call session
   */
  broadcastCallRinging(tenantId: string, call: CallSession): void {
    const event: CallSignalingEvent = {
      type: WEBSOCKET_EVENTS.CALL_RINGING,
      callId: call.id,
      call,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to all participants
    this.io.to(WEBSOCKET_ROOMS.CALL(tenantId, call.id)).emit(
      WEBSOCKET_EVENTS.CALL_RINGING,
      event
    );
  }

  /**
   * Broadcast call accepted
   * 
   * Notifies caller that call was accepted.
   * 
   * @param tenantId - Tenant ID
   * @param call - Call session
   * @param acceptedBy - Device/operator ID that accepted
   */
  broadcastCallAccept(
    tenantId: string,
    call: CallSession,
    acceptedBy: string
  ): void {
    const event: CallSignalingEvent = {
      type: WEBSOCKET_EVENTS.CALL_ACCEPT,
      callId: call.id,
      call,
      acceptedBy,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to call room
    this.io.to(WEBSOCKET_ROOMS.CALL(tenantId, call.id)).emit(
      WEBSOCKET_EVENTS.CALL_ACCEPT,
      event
    );
  }

  /**
   * Broadcast call accepted elsewhere
   * 
   * Notifies devices that didn't win first-answer race.
   * 
   * @param tenantId - Tenant ID
   * @param callId - Call ID
   * @param acceptedBy - Device/operator ID that won
   * @param notifyDeviceIds - Devices to notify
   * @param notifyOperatorIds - Operators to notify
   */
  broadcastCallAcceptedElsewhere(
    tenantId: string,
    callId: string,
    acceptedBy: string,
    notifyDeviceIds: string[],
    notifyOperatorIds: string[]
  ): void {
    const event: CallSignalingEvent = {
      type: WEBSOCKET_EVENTS.CALL_ACCEPTED_ELSEWHERE,
      callId,
      acceptedBy,
      timestamp: new Date().toISOString(),
    };

    // Notify each device that didn't accept
    for (const deviceId of notifyDeviceIds) {
      if (deviceId !== acceptedBy) {
        this.io.to(WEBSOCKET_ROOMS.DEVICE(tenantId, deviceId)).emit(
          WEBSOCKET_EVENTS.CALL_ACCEPTED_ELSEWHERE,
          event
        );
      }
    }

    // Notify each operator that didn't accept
    for (const operatorId of notifyOperatorIds) {
      if (operatorId !== acceptedBy) {
        this.io.to(WEBSOCKET_ROOMS.OPERATOR(tenantId, operatorId)).emit(
          WEBSOCKET_EVENTS.CALL_ACCEPTED_ELSEWHERE,
          event
        );
      }
    }
  }

  /**
   * Broadcast call rejected
   * 
   * @param tenantId - Tenant ID
   * @param callId - Call ID
   * @param rejectedBy - Device/operator ID that rejected
   */
  broadcastCallReject(
    tenantId: string,
    callId: string,
    rejectedBy: string
  ): void {
    const event: CallSignalingEvent = {
      type: WEBSOCKET_EVENTS.CALL_REJECT,
      callId,
      rejectedBy,
      timestamp: new Date().toISOString(),
    };

    this.io.to(WEBSOCKET_ROOMS.CALL(tenantId, callId)).emit(
      WEBSOCKET_EVENTS.CALL_REJECT,
      event
    );
  }

  /**
   * Broadcast call cancelled
   * 
   * @param tenantId - Tenant ID
   * @param callId - Call ID
   * @param cancelledBy - Device/operator ID that cancelled
   */
  broadcastCallCancel(
    tenantId: string,
    callId: string,
    cancelledBy: string
  ): void {
    const event: CallSignalingEvent = {
      type: WEBSOCKET_EVENTS.CALL_CANCEL,
      callId,
      cancelledBy,
      timestamp: new Date().toISOString(),
    };

    this.io.to(WEBSOCKET_ROOMS.CALL(tenantId, callId)).emit(
      WEBSOCKET_EVENTS.CALL_CANCEL,
      event
    );
  }

  /**
   * Broadcast call connected
   * 
   * @param tenantId - Tenant ID
   * @param call - Call session
   */
  broadcastCallConnected(tenantId: string, call: CallSession): void {
    const event: CallSignalingEvent = {
      type: WEBSOCKET_EVENTS.CALL_CONNECTING,
      callId: call.id,
      call,
      timestamp: new Date().toISOString(),
    };

    this.io.to(WEBSOCKET_ROOMS.CALL(tenantId, call.id)).emit(
      WEBSOCKET_EVENTS.CALL_CONNECTING,
      event
    );
  }

  /**
   * Broadcast call ended
   * 
   * @param tenantId - Tenant ID
   * @param callId - Call ID
   * @param endReason - Reason for ending
   */
  broadcastCallEnd(
    tenantId: string,
    callId: string,
    endReason: string
  ): void {
    const event: CallSignalingEvent = {
      type: WEBSOCKET_EVENTS.CALL_END,
      callId,
      endReason,
      timestamp: new Date().toISOString(),
    };

    this.io.to(WEBSOCKET_ROOMS.CALL(tenantId, callId)).emit(
      WEBSOCKET_EVENTS.CALL_END,
      event
    );
  }

  /**
   * Broadcast call failed
   * 
   * @param tenantId - Tenant ID
   * @param callId - Call ID
   * @param reason - Failure reason
   */
  broadcastCallFailed(
    tenantId: string,
    callId: string,
    reason: string
  ): void {
    const event: CallSignalingEvent = {
      type: WEBSOCKET_EVENTS.CALL_FAILED,
      callId,
      reason,
      timestamp: new Date().toISOString(),
    };

    this.io.to(WEBSOCKET_ROOMS.CALL(tenantId, callId)).emit(
      WEBSOCKET_EVENTS.CALL_FAILED,
      event
    );
  }

  /**
   * Broadcast message created
   * 
   * Delivers new message to online conversation participants.
   * 
   * @param tenantId - Tenant ID
   * @param conversationId - Conversation ID
   * @param message - Message
   * @param targetDeviceIds - Devices to notify
   * @param targetOperatorIds - Operators to notify
   */
  broadcastMessageCreated(
    tenantId: string,
    conversationId: string,
    message: Message,
    targetDeviceIds: string[],
    targetOperatorIds: string[]
  ): void {
    const event: MessageSignalingEvent = {
      type: WEBSOCKET_EVENTS.MESSAGE_CREATED,
      conversationId,
      message,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to conversation room
    this.io.to(WEBSOCKET_ROOMS.CONVERSATION(tenantId, conversationId)).emit(
      WEBSOCKET_EVENTS.MESSAGE_CREATED,
      event
    );

    // Also send directly to each target device
    for (const deviceId of targetDeviceIds) {
      this.io.to(WEBSOCKET_ROOMS.DEVICE(tenantId, deviceId)).emit(
        WEBSOCKET_EVENTS.MESSAGE_CREATED,
        event
      );
    }

    // Send to operators
    for (const operatorId of targetOperatorIds) {
      this.io.to(WEBSOCKET_ROOMS.OPERATOR(tenantId, operatorId)).emit(
        WEBSOCKET_EVENTS.MESSAGE_CREATED,
        event
      );
    }
  }

  /**
   * Broadcast message delivered
   * 
   * @param tenantId - Tenant ID
   * @param conversationId - Conversation ID
   * @param messageId - Message ID
   * @param deliveredBy - Device/operator ID that received
   */
  broadcastMessageDelivered(
    tenantId: string,
    conversationId: string,
    messageId: string,
    deliveredBy: string
  ): void {
    const event: MessageSignalingEvent = {
      type: WEBSOCKET_EVENTS.MESSAGE_DELIVERED,
      conversationId,
      messageId,
      deliveredBy,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to conversation
    this.io.to(WEBSOCKET_ROOMS.CONVERSATION(tenantId, conversationId)).emit(
      WEBSOCKET_EVENTS.MESSAGE_DELIVERED,
      event
    );
  }

  /**
   * Broadcast message read
   * 
   * @param tenantId - Tenant ID
   * @param conversationId - Conversation ID
   * @param messageId - Message ID
   * @param readBy - Device/operator ID that read
   */
  broadcastMessageRead(
    tenantId: string,
    conversationId: string,
    messageId: string,
    readBy: string
  ): void {
    const event: MessageSignalingEvent = {
      type: WEBSOCKET_EVENTS.MESSAGE_READ,
      conversationId,
      messageId,
      readBy,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to conversation
    this.io.to(WEBSOCKET_ROOMS.CONVERSATION(tenantId, conversationId)).emit(
      WEBSOCKET_EVENTS.MESSAGE_READ,
      event
    );
  }

  /**
   * Broadcast presence change
   * 
   * @param tenantId - Tenant ID
   * @param entityType - Entity type (device, employee, branch, operator)
   * @param entityId - Entity ID
   * @param status - New presence status
   */
  broadcastPresenceChanged(
    tenantId: string,
    entityType: 'device' | 'employee' | 'branch' | 'operator',
    entityId: string,
    status: CommunicationPresence
  ): void {
    const event: PresenceSignalingEvent = {
      type: WEBSOCKET_EVENTS.PRESENCE_CHANGED,
      entityType,
      entityId,
      status,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to tenant room
    this.io.to(`tenant:${tenantId}`).emit(
      WEBSOCKET_EVENTS.PRESENCE_CHANGED,
      event
    );

    // Also broadcast to entity-specific room
    if (entityType === 'device') {
      this.io.to(WEBSOCKET_ROOMS.DEVICE(tenantId, entityId)).emit(
        WEBSOCKET_EVENTS.PRESENCE_CHANGED,
        event
      );
    } else if (entityType === 'employee') {
      this.io.to(WEBSOCKET_ROOMS.EMPLOYEE(tenantId, entityId)).emit(
        WEBSOCKET_EVENTS.PRESENCE_CHANGED,
        event
      );
    } else if (entityType === 'branch') {
      this.io.to(WEBSOCKET_ROOMS.BRANCH(tenantId, entityId)).emit(
        WEBSOCKET_EVENTS.PRESENCE_CHANGED,
        event
      );
    } else if (entityType === 'operator') {
      this.io.to(WEBSOCKET_ROOMS.OPERATOR(tenantId, entityId)).emit(
        WEBSOCKET_EVENTS.PRESENCE_CHANGED,
        event
      );
    }
  }

  /**
   * Broadcast device online
   * 
   * Convenience method for device coming online.
   * 
   * @param tenantId - Tenant ID
   * @param deviceId - Device ID
   */
  broadcastDeviceOnline(tenantId: string, deviceId: string): void {
    this.broadcastPresenceChanged(tenantId, 'device', deviceId, 'ONLINE');
  }

  /**
   * Broadcast device offline
   * 
   * Convenience method for device going offline.
   * 
   * @param tenantId - Tenant ID
   * @param deviceId - Device ID
   */
  broadcastDeviceOffline(tenantId: string, deviceId: string): void {
    this.broadcastPresenceChanged(tenantId, 'device', deviceId, 'OFFLINE');
  }

  /**
   * Add socket to call room
   * 
   * Used when call is initiated to group all participants.
   * 
   * @param tenantId - Tenant ID
   * @param callId - Call ID
   * @param socketId - Socket ID to add
   */
  addToCallRoom(tenantId: string, callId: string, socketId: string): void {
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.join(WEBSOCKET_ROOMS.CALL(tenantId, callId));
    }
  }

  /**
   * Remove socket from call room
   * 
   * @param tenantId - Tenant ID
   * @param callId - Call ID
   * @param socketId - Socket ID to remove
   */
  removeFromCallRoom(tenantId: string, callId: string, socketId: string): void {
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.leave(WEBSOCKET_ROOMS.CALL(tenantId, callId));
    }
  }
}
