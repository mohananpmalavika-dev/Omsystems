/**
 * Event Bus Service
 * Integrates NATS event bus with Security Commander
 */

import { NatsClient } from './nats-client';
import { EventIngestionService } from '../services/event-ingestion.service';
import { NormalizerRegistry } from '../normalizers/normalizer.registry';
import type {
  EVENT_SUBJECTS,
  EventBusMessage,
  CameraEventPayload,
  AccessEventPayload,
  NetworkEventPayload,
  AIDetectionPayload,
} from './event-bus.types';
import type { SecurityEvent } from '../types';

export class EventBusService {
  private natsClient: NatsClient;
  private eventIngestionService: EventIngestionService;
  private normalizerRegistry: NormalizerRegistry;
  private isStarted: boolean = false;

  constructor(
    private readonly config: {
      natsServers?: string[];
      eventIngestionService: EventIngestionService;
      normalizerRegistry: NormalizerRegistry;
    }
  ) {
    this.natsClient = new NatsClient(
      config.natsServers || ['nats://localhost:4222'],
      { name: 'security-commander-event-bus' }
    );
    this.eventIngestionService = config.eventIngestionService;
    this.normalizerRegistry = config.normalizerRegistry;
  }

  /**
   * Start event bus subscriptions
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      console.warn('[EventBus] Already started');
      return;
    }

    try {
      // Connect to NATS
      await this.natsClient.connect();

      // Subscribe to security event streams
      await this.subscribeToSecurityEvents();

      this.isStarted = true;
      console.log('[EventBus] Started successfully');
    } catch (error) {
      console.error('[EventBus] Failed to start:', error);
      throw error;
    }
  }

  /**
   * Subscribe to all security event streams
   */
  private async subscribeToSecurityEvents(): Promise<void> {
    // Camera events
    await this.natsClient.subscribe(
      { subject: 'security.camera.>', queue: 'security-commander' },
      async (msg) => this.handleCameraEvent(msg)
    );

    // Access control events
    await this.natsClient.subscribe(
      { subject: 'security.access.>', queue: 'security-commander' },
      async (msg) => this.handleAccessEvent(msg)
    );

    // Network events
    await this.natsClient.subscribe(
      { subject: 'security.network.>', queue: 'security-commander' },
      async (msg) => this.handleNetworkEvent(msg)
    );

    // Storage events
    await this.natsClient.subscribe(
      { subject: 'security.storage.>', queue: 'security-commander' },
      async (msg) => this.handleStorageEvent(msg)
    );

    // AI detection events
    await this.natsClient.subscribe(
      { subject: 'security.ai.>', queue: 'security-commander' },
      async (msg) => this.handleAIDetectionEvent(msg)
    );

    // Recorder events
    await this.natsClient.subscribe(
      { subject: 'security.recorder.>', queue: 'security-commander' },
      async (msg) => this.handleRecorderEvent(msg)
    );

    console.log('[EventBus] Subscribed to all security event streams');
  }

  /**
   * Handle camera events
   */
  private async handleCameraEvent(message: EventBusMessage<CameraEventPayload>): Promise<void> {
    try {
      const payload = message.data;

      // Normalize to SecurityEvent
      const securityEvent: SecurityEvent = {
        id: message.id,
        eventType: payload.eventType,
        timestamp: new Date(payload.timestamp),
        source: 'camera',
        assetId: payload.cameraId,
        severity: payload.severity,
        description: payload.description || `Camera event: ${payload.eventType}`,
        metadata: {
          ...payload.metadata,
          eventBusSubject: message.subject,
          correlationId: message.metadata?.correlationId,
        },
      };

      // Ingest event (triggers anomaly detection and correlation)
      await this.eventIngestionService.ingestEvent(securityEvent);

      console.log(`[EventBus] Processed camera event: ${payload.cameraId} - ${payload.eventType}`);
    } catch (error) {
      console.error('[EventBus] Error handling camera event:', error);
      throw error;
    }
  }

  /**
   * Handle access control events
   */
  private async handleAccessEvent(message: EventBusMessage<AccessEventPayload>): Promise<void> {
    try {
      const payload = message.data;

      // Calculate severity based on authorization
      const severity = !payload.allowed ? 85 : 30;

      const securityEvent: SecurityEvent = {
        id: message.id,
        eventType: payload.allowed ? 'access_granted' : 'unauthorized_access',
        timestamp: new Date(payload.timestamp),
        source: 'access_control',
        assetId: payload.doorId,
        severity,
        description: payload.reason || 
          `Access ${payload.allowed ? 'granted' : 'denied'} at ${payload.doorId}`,
        metadata: {
          userId: payload.userId,
          badgeId: payload.badgeId,
          allowed: payload.allowed,
          ...payload.metadata,
          eventBusSubject: message.subject,
        },
      };

      await this.eventIngestionService.ingestEvent(securityEvent);

      console.log(`[EventBus] Processed access event: ${payload.doorId} - ${payload.allowed ? 'granted' : 'denied'}`);
    } catch (error) {
      console.error('[EventBus] Error handling access event:', error);
      throw error;
    }
  }

  /**
   * Handle network events
   */
  private async handleNetworkEvent(message: EventBusMessage<NetworkEventPayload>): Promise<void> {
    try {
      const payload = message.data;

      // Calculate severity based on status
      const severity = payload.status === 'down' ? 80 : payload.status === 'degraded' ? 60 : 20;

      const securityEvent: SecurityEvent = {
        id: message.id,
        eventType: `${payload.deviceType}_${payload.status}`,
        timestamp: new Date(payload.timestamp),
        source: 'network',
        assetId: payload.deviceId,
        severity,
        description: `${payload.deviceType} ${payload.deviceId} is ${payload.status}`,
        metadata: {
          deviceType: payload.deviceType,
          status: payload.status,
          ...payload.metadata,
          eventBusSubject: message.subject,
        },
      };

      await this.eventIngestionService.ingestEvent(securityEvent);

      console.log(`[EventBus] Processed network event: ${payload.deviceId} - ${payload.status}`);
    } catch (error) {
      console.error('[EventBus] Error handling network event:', error);
      throw error;
    }
  }

  /**
   * Handle storage events
   */
  private async handleStorageEvent(message: EventBusMessage<any>): Promise<void> {
    try {
      const payload = message.data;

      const securityEvent: SecurityEvent = {
        id: message.id,
        eventType: payload.eventType || 'storage_event',
        timestamp: new Date(payload.timestamp || message.timestamp),
        source: 'storage',
        assetId: payload.storageId || payload.deviceId,
        severity: payload.severity || 50,
        description: payload.description || 'Storage event',
        metadata: {
          ...payload.metadata,
          eventBusSubject: message.subject,
        },
      };

      await this.eventIngestionService.ingestEvent(securityEvent);

      console.log(`[EventBus] Processed storage event: ${securityEvent.assetId}`);
    } catch (error) {
      console.error('[EventBus] Error handling storage event:', error);
      throw error;
    }
  }

  /**
   * Handle AI detection events
   */
  private async handleAIDetectionEvent(message: EventBusMessage<AIDetectionPayload>): Promise<void> {
    try {
      const payload = message.data;

      // Calculate severity based on detection type
      const severityMap: Record<string, number> = {
        fire: 95,
        smoke: 90,
        weapon: 95,
        intrusion: 85,
        fall: 80,
        unauthorized_access: 85,
        tailgating: 75,
        loitering: 60,
        person: 30,
        vehicle: 30,
        motion: 25,
      };

      const severity = severityMap[payload.detectionType] || 50;

      const securityEvent: SecurityEvent = {
        id: message.id,
        eventType: payload.detectionType,
        timestamp: new Date(payload.timestamp),
        source: 'ai_detection',
        assetId: payload.cameraId,
        severity,
        description: `AI detected: ${payload.detectionType} (confidence: ${(payload.confidence * 100).toFixed(1)}%)`,
        metadata: {
          detectionId: payload.detectionId,
          confidence: payload.confidence,
          boundingBox: payload.boundingBox,
          attributes: payload.attributes,
          ...payload.metadata,
          eventBusSubject: message.subject,
        },
      };

      await this.eventIngestionService.ingestEvent(securityEvent);

      console.log(`[EventBus] Processed AI detection: ${payload.cameraId} - ${payload.detectionType}`);
    } catch (error) {
      console.error('[EventBus] Error handling AI detection event:', error);
      throw error;
    }
  }

  /**
   * Handle recorder events
   */
  private async handleRecorderEvent(message: EventBusMessage<any>): Promise<void> {
    try {
      const payload = message.data;

      const securityEvent: SecurityEvent = {
        id: message.id,
        eventType: payload.eventType || 'recorder_event',
        timestamp: new Date(payload.timestamp || message.timestamp),
        source: 'recorder',
        assetId: payload.recorderId || payload.dvrId,
        severity: payload.severity || 60,
        description: payload.description || 'Recorder event',
        metadata: {
          ...payload.metadata,
          eventBusSubject: message.subject,
        },
      };

      await this.eventIngestionService.ingestEvent(securityEvent);

      console.log(`[EventBus] Processed recorder event: ${securityEvent.assetId}`);
    } catch (error) {
      console.error('[EventBus] Error handling recorder event:', error);
      throw error;
    }
  }

  /**
   * Publish investigation created event
   */
  async publishInvestigationCreated(investigationId: string, metadata: any): Promise<void> {
    try {
      await this.natsClient.publish('commander.investigation.created', {
        investigationId,
        timestamp: new Date(),
        ...metadata,
      });
      console.log(`[EventBus] Published investigation created: ${investigationId}`);
    } catch (error) {
      console.error('[EventBus] Failed to publish investigation created:', error);
    }
  }

  /**
   * Publish incident created event
   */
  async publishIncidentCreated(incidentId: string, metadata: any): Promise<void> {
    try {
      await this.natsClient.publish('commander.incident.created', {
        incidentId,
        timestamp: new Date(),
        ...metadata,
      });
      console.log(`[EventBus] Published incident created: ${incidentId}`);
    } catch (error) {
      console.error('[EventBus] Failed to publish incident created:', error);
    }
  }

  /**
   * Publish evidence collected event
   */
  async publishEvidenceCollected(evidenceId: string, metadata: any): Promise<void> {
    try {
      await this.natsClient.publish('commander.evidence.collected', {
        evidenceId,
        timestamp: new Date(),
        ...metadata,
      });
      console.log(`[EventBus] Published evidence collected: ${evidenceId}`);
    } catch (error) {
      console.error('[EventBus] Failed to publish evidence collected:', error);
    }
  }

  /**
   * Get event bus statistics
   */
  getStats() {
    return this.natsClient.getStats();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.natsClient.isConnected();
  }

  /**
   * Stop event bus
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    try {
      await this.natsClient.disconnect();
      this.isStarted = false;
      console.log('[EventBus] Stopped');
    } catch (error) {
      console.error('[EventBus] Error stopping:', error);
      throw error;
    }
  }
}
