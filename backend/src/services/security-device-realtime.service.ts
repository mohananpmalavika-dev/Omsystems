/**
 * Security Device Real-Time Event Service
 * 
 * Manages WebSocket/SSE connections for real-time security device events:
 * - DEVICE_ONLINE / DEVICE_OFFLINE
 * - DEVICE_ALARM
 * - PANIC_BUTTON_PRESSED
 * - DOOR_FORCED_OPEN
 * - VAULT_OPENED
 * - FIRE_ALARM
 * - Device health changes
 * - Correlated incident creation
 * 
 * Integrates with existing WebSocket infrastructure for event broadcasting
 */

import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import { Server as WebSocketServer } from 'ws';
import {
  SecurityDeviceEvent,
  CorrelatedSecurityIncident,
  SecurityDevice,
} from '../types/security-device';

export interface SecurityDeviceRealtimeEvent {
  type: 
    | 'DEVICE_ONLINE'
    | 'DEVICE_OFFLINE'
    | 'DEVICE_DEGRADED'
    | 'DEVICE_ALARM'
    | 'DEVICE_HEALTH_CHANGE'
    | 'PANIC_BUTTON_PRESSED'
    | 'DOOR_FORCED_OPEN'
    | 'VAULT_OPENED'
    | 'VAULT_UNAUTHORIZED_ACCESS'
    | 'FIRE_ALARM'
    | 'SMOKE_DETECTED'
    | 'ATM_TAMPERING'
    | 'POWER_FAILURE'
    | 'INTRUSION_DETECTED'
    | 'GLASS_BREAK_DETECTED'
    | 'CORRELATED_INCIDENT_CREATED'
    | 'CORRELATED_INCIDENT_UPDATED'
    | 'PANIC_EMERGENCY_CREATED'
    | 'PANIC_EMERGENCY_ACKNOWLEDGED'
    | 'DEVICE_COMMAND_EXECUTED'
    | 'DISCOVERY_JOB_COMPLETED'
    | 'BRANCH_POSTURE_UPDATED';
  
  deviceId?: string;
  branchId?: string;
  tenantId: string;
  
  timestamp: string;
  severity?: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  
  data: any;
  metadata?: Record<string, any>;
}

export interface WebSocketClient {
  id: string;
  userId: string;
  tenantId: string;
  branchIds?: string[]; // Branch filter
  deviceTypes?: string[]; // Device type filter
  eventTypes?: string[]; // Event type filter
  connectedAt: Date;
  lastPing?: Date;
}

export class SecurityDeviceRealtimeService extends EventEmitter {
  private static instance: SecurityDeviceRealtimeService;
  private clients = new Map<string, WebSocketClient>();
  private redisSubscriber: Redis;
  private redisPublisher: Redis;

  // Redis channels for pub/sub
  private readonly DEVICE_EVENTS_CHANNEL = 'security-device-events';
  private readonly PANIC_EVENTS_CHANNEL = 'panic-emergency-events';
  private readonly INCIDENT_EVENTS_CHANNEL = 'correlated-incident-events';
  private readonly POSTURE_EVENTS_CHANNEL = 'branch-posture-updates';

  private constructor(redis: Redis) {
    super();
    this.redisPublisher = redis;
    this.redisSubscriber = redis.duplicate();
    
    this.initializeRedisSubscriptions();
  }

  static getInstance(redis?: Redis): SecurityDeviceRealtimeService {
    if (!SecurityDeviceRealtimeService.instance) {
      if (!redis) {
        throw new Error('Redis required for first initialization');
      }
      SecurityDeviceRealtimeService.instance = new SecurityDeviceRealtimeService(redis);
    }
    return SecurityDeviceRealtimeService.instance;
  }

  /**
   * Initialize Redis pub/sub subscriptions
   */
  private async initializeRedisSubscriptions(): Promise<void> {
    await this.redisSubscriber.subscribe(
      this.DEVICE_EVENTS_CHANNEL,
      this.PANIC_EVENTS_CHANNEL,
      this.INCIDENT_EVENTS_CHANNEL,
      this.POSTURE_EVENTS_CHANNEL
    );

    this.redisSubscriber.on('message', (channel, message) => {
      try {
        const event = JSON.parse(message) as SecurityDeviceRealtimeEvent;
        this.broadcastEvent(event);
      } catch (error) {
        console.error('[SecurityDeviceRealtime] Failed to parse Redis message:', error);
      }
    });

    console.log('[SecurityDeviceRealtime] Redis subscriptions initialized');
  }

  /**
   * Register a WebSocket client
   */
  registerClient(client: WebSocketClient): void {
    this.clients.set(client.id, client);
    console.log(`[SecurityDeviceRealtime] Client registered: ${client.id} (user: ${client.userId})`);
    
    this.emit('client-connected', client);
  }

  /**
   * Unregister a WebSocket client
   */
  unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      console.log(`[SecurityDeviceRealtime] Client unregistered: ${clientId}`);
      this.emit('client-disconnected', client);
    }
  }

  /**
   * Update client filters
   */
  updateClientFilters(
    clientId: string,
    filters: {
      branchIds?: string[];
      deviceTypes?: string[];
      eventTypes?: string[];
    }
  ): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.branchIds = filters.branchIds;
      client.deviceTypes = filters.deviceTypes;
      client.eventTypes = filters.eventTypes;
      console.log(`[SecurityDeviceRealtime] Updated filters for client ${clientId}`);
    }
  }

  /**
   * Publish device event
   */
  async publishDeviceEvent(event: SecurityDeviceEvent): Promise<void> {
    const realtimeEvent: SecurityDeviceRealtimeEvent = {
      type: this.mapEventType(event.eventType),
      deviceId: event.deviceId,
      branchId: event.branchId,
      tenantId: event.tenantId,
      timestamp: new Date().toISOString(),
      severity: event.severity as any,
      data: {
        eventId: event.id,
        eventType: event.eventType,
        deviceType: event.deviceType,
        title: event.title,
        description: event.description,
        location: event.location,
        metadata: event.metadata,
      },
    };

    await this.redisPublisher.publish(
      this.DEVICE_EVENTS_CHANNEL,
      JSON.stringify(realtimeEvent)
    );
  }

  /**
   * Publish panic emergency event
   */
  async publishPanicEmergency(emergency: any): Promise<void> {
    const realtimeEvent: SecurityDeviceRealtimeEvent = {
      type: 'PANIC_EMERGENCY_CREATED',
      deviceId: emergency.panicEvent.deviceId,
      branchId: emergency.panicEvent.branchId,
      tenantId: 'system', // TODO: Get from context
      timestamp: new Date().toISOString(),
      severity: 'CRITICAL',
      data: {
        incidentNumber: emergency.incidentNumber,
        location: emergency.panicEvent.location,
        triggeredBy: emergency.panicEvent.triggeredBy,
        attachedCameras: emergency.attachedCameras,
        notificationsSent: emergency.notificationsSent.length,
        socEscalated: emergency.socEscalated,
      },
    };

    await this.redisPublisher.publish(
      this.PANIC_EVENTS_CHANNEL,
      JSON.stringify(realtimeEvent)
    );
  }

  /**
   * Publish panic acknowledgement
   */
  async publishPanicAcknowledgement(panicEventId: string, userId: string, emergency: any): Promise<void> {
    const realtimeEvent: SecurityDeviceRealtimeEvent = {
      type: 'PANIC_EMERGENCY_ACKNOWLEDGED',
      deviceId: emergency.panicEvent.deviceId,
      branchId: emergency.panicEvent.branchId,
      tenantId: 'system',
      timestamp: new Date().toISOString(),
      severity: 'INFO',
      data: {
        panicEventId,
        acknowledgedBy: userId,
        acknowledgedAt: new Date().toISOString(),
        incidentNumber: emergency.incidentNumber,
      },
    };

    await this.redisPublisher.publish(
      this.PANIC_EVENTS_CHANNEL,
      JSON.stringify(realtimeEvent)
    );
  }

  /**
   * Publish correlated incident
   */
  async publishCorrelatedIncident(incident: CorrelatedSecurityIncident): Promise<void> {
    const realtimeEvent: SecurityDeviceRealtimeEvent = {
      type: 'CORRELATED_INCIDENT_CREATED',
      branchId: incident.branchId,
      tenantId: incident.tenantId,
      timestamp: new Date().toISOString(),
      severity: incident.severity === 'P1' ? 'CRITICAL' : incident.severity === 'P2' ? 'ERROR' : 'WARNING',
      data: {
        incidentId: incident.id,
        incidentType: incident.incidentType,
        severity: incident.severity,
        confidence: incident.confidence,
        title: incident.title,
        description: incident.description,
        deviceIds: incident.deviceIds,
        attachedCameraIds: incident.attachedCameraIds,
      },
      metadata: incident.metadata,
    };

    await this.redisPublisher.publish(
      this.INCIDENT_EVENTS_CHANNEL,
      JSON.stringify(realtimeEvent)
    );
  }

  /**
   * Publish device status change
   */
  async publishDeviceStatusChange(
    device: SecurityDevice,
    oldStatus: string,
    newStatus: string
  ): Promise<void> {
    const eventType = 
      newStatus === 'online' ? 'DEVICE_ONLINE' :
      newStatus === 'offline' ? 'DEVICE_OFFLINE' :
      'DEVICE_DEGRADED';

    const realtimeEvent: SecurityDeviceRealtimeEvent = {
      type: eventType,
      deviceId: device.id,
      branchId: device.branchId,
      tenantId: device.tenantId,
      timestamp: new Date().toISOString(),
      severity: newStatus === 'offline' ? 'ERROR' : newStatus === 'degraded' ? 'WARNING' : 'INFO',
      data: {
        deviceName: device.name,
        deviceType: device.deviceType,
        location: device.location,
        oldStatus,
        newStatus,
        health: device.health,
      },
    };

    await this.redisPublisher.publish(
      this.DEVICE_EVENTS_CHANNEL,
      JSON.stringify(realtimeEvent)
    );
  }

  /**
   * Publish device health change
   */
  async publishDeviceHealthChange(
    device: SecurityDevice,
    healthMetrics: Record<string, number>
  ): Promise<void> {
    const realtimeEvent: SecurityDeviceRealtimeEvent = {
      type: 'DEVICE_HEALTH_CHANGE',
      deviceId: device.id,
      branchId: device.branchId,
      tenantId: device.tenantId,
      timestamp: new Date().toISOString(),
      severity: 'INFO',
      data: {
        deviceName: device.name,
        deviceType: device.deviceType,
        healthMetrics,
        status: device.health?.status,
      },
    };

    await this.redisPublisher.publish(
      this.DEVICE_EVENTS_CHANNEL,
      JSON.stringify(realtimeEvent)
    );
  }

  /**
   * Publish device alarm
   */
  async publishDeviceAlarm(device: SecurityDevice, alarmMessage: string): Promise<void> {
    const realtimeEvent: SecurityDeviceRealtimeEvent = {
      type: 'DEVICE_ALARM',
      deviceId: device.id,
      branchId: device.branchId,
      tenantId: device.tenantId,
      timestamp: new Date().toISOString(),
      severity: 'CRITICAL',
      data: {
        deviceName: device.name,
        deviceType: device.deviceType,
        location: device.location,
        alarmMessage,
      },
    };

    await this.redisPublisher.publish(
      this.DEVICE_EVENTS_CHANNEL,
      JSON.stringify(realtimeEvent)
    );
  }

  /**
   * Publish branch posture update
   */
  async publishBranchPostureUpdate(branchId: string, posture: any): Promise<void> {
    const realtimeEvent: SecurityDeviceRealtimeEvent = {
      type: 'BRANCH_POSTURE_UPDATED',
      branchId,
      tenantId: 'system',
      timestamp: new Date().toISOString(),
      severity: posture.riskLevel === 'critical' ? 'CRITICAL' : posture.riskLevel === 'high' ? 'ERROR' : 'INFO',
      data: {
        overallScore: posture.overallScore,
        riskLevel: posture.riskLevel,
        activeAlarms: posture.activeAlarms,
        criticalIssues: posture.criticalIssues,
      },
    };

    await this.redisPublisher.publish(
      this.POSTURE_EVENTS_CHANNEL,
      JSON.stringify(realtimeEvent)
    );
  }

  /**
   * Publish device command execution
   */
  async publishCommandExecution(
    deviceId: string,
    branchId: string,
    command: string,
    status: string,
    executedBy: string
  ): Promise<void> {
    const realtimeEvent: SecurityDeviceRealtimeEvent = {
      type: 'DEVICE_COMMAND_EXECUTED',
      deviceId,
      branchId,
      tenantId: 'system',
      timestamp: new Date().toISOString(),
      severity: 'INFO',
      data: {
        command,
        status,
        executedBy,
      },
    };

    await this.redisPublisher.publish(
      this.DEVICE_EVENTS_CHANNEL,
      JSON.stringify(realtimeEvent)
    );
  }

  /**
   * Broadcast event to connected clients
   */
  private broadcastEvent(event: SecurityDeviceRealtimeEvent): void {
    let clientsNotified = 0;

    for (const client of this.clients.values()) {
      // Check if client should receive this event
      if (!this.shouldSendToClient(client, event)) {
        continue;
      }

      // Emit event for WebSocket handler to send
      this.emit('event-for-client', {
        clientId: client.id,
        event,
      });

      clientsNotified++;
    }

    if (clientsNotified > 0) {
      console.log(`[SecurityDeviceRealtime] Broadcasted ${event.type} to ${clientsNotified} clients`);
    }
  }

  /**
   * Check if event should be sent to client based on filters
   */
  private shouldSendToClient(client: WebSocketClient, event: SecurityDeviceRealtimeEvent): boolean {
    // Tenant check
    if (client.tenantId !== event.tenantId && event.tenantId !== 'system') {
      return false;
    }

    // Branch filter
    if (client.branchIds && client.branchIds.length > 0 && event.branchId) {
      if (!client.branchIds.includes(event.branchId)) {
        return false;
      }
    }

    // Event type filter
    if (client.eventTypes && client.eventTypes.length > 0) {
      if (!client.eventTypes.includes(event.type)) {
        return false;
      }
    }

    // Device type filter (check event data)
    if (client.deviceTypes && client.deviceTypes.length > 0 && event.data?.deviceType) {
      if (!client.deviceTypes.includes(event.data.deviceType)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Map SecurityDeviceEventType to RealtimeEventType
   */
  private mapEventType(eventType: string): SecurityDeviceRealtimeEvent['type'] {
    const mapping: Record<string, SecurityDeviceRealtimeEvent['type']> = {
      'PANIC_BUTTON_PRESSED': 'PANIC_BUTTON_PRESSED',
      'DURESS_BUTTON_PRESSED': 'PANIC_BUTTON_PRESSED',
      'EMERGENCY_BUTTON_PRESSED': 'PANIC_BUTTON_PRESSED',
      'DOOR_FORCED_OPEN': 'DOOR_FORCED_OPEN',
      'VAULT_OPENED': 'VAULT_OPENED',
      'VAULT_UNAUTHORIZED_ACCESS': 'VAULT_UNAUTHORIZED_ACCESS',
      'FIRE_ALARM_TRIGGERED': 'FIRE_ALARM',
      'SMOKE_DETECTED': 'SMOKE_DETECTED',
      'ATM_TAMPER': 'ATM_TAMPERING',
      'POWER_FAILURE': 'POWER_FAILURE',
      'INTRUSION_DETECTED': 'INTRUSION_DETECTED',
      'GLASS_BREAK_DETECTED': 'GLASS_BREAK_DETECTED',
      'DEVICE_ONLINE': 'DEVICE_ONLINE',
      'DEVICE_OFFLINE': 'DEVICE_OFFLINE',
      'ALARM_ZONE_TRIGGERED': 'DEVICE_ALARM',
    };

    return mapping[eventType] || 'DEVICE_HEALTH_CHANGE';
  }

  /**
   * Get connected clients count
   */
  getConnectedClientsCount(): number {
    return this.clients.size;
  }

  /**
   * Get clients by branch
   */
  getClientsByBranch(branchId: string): WebSocketClient[] {
    return Array.from(this.clients.values()).filter(
      client => !client.branchIds || client.branchIds.includes(branchId)
    );
  }

  /**
   * Send heartbeat to all clients
   */
  sendHeartbeat(): void {
    const heartbeatEvent: SecurityDeviceRealtimeEvent = {
      type: 'DEVICE_HEALTH_CHANGE', // Use as heartbeat type
      tenantId: 'system',
      timestamp: new Date().toISOString(),
      severity: 'INFO',
      data: {
        heartbeat: true,
        connectedClients: this.clients.size,
      },
    };

    for (const client of this.clients.values()) {
      client.lastPing = new Date();
      this.emit('event-for-client', {
        clientId: client.id,
        event: heartbeatEvent,
      });
    }
  }

  /**
   * Cleanup inactive clients
   */
  cleanupInactiveClients(timeoutMinutes: number = 5): void {
    const timeout = timeoutMinutes * 60 * 1000;
    const now = Date.now();

    for (const [clientId, client] of this.clients.entries()) {
      const lastPing = client.lastPing?.getTime() || client.connectedAt.getTime();
      if (now - lastPing > timeout) {
        console.log(`[SecurityDeviceRealtime] Removing inactive client: ${clientId}`);
        this.unregisterClient(clientId);
      }
    }
  }
}
