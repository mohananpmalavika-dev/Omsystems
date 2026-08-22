/**
 * Event Emitters
 * High-level helpers for emitting domain events
 */

import type { EventBus } from './event-bus.js';
import { EventType } from './event-types.js';
import type {
  CameraStatusChangedPayload,
  CameraStreamFailedPayload,
  CameraRecoveredPayload,
  RecordingGapDetectedPayload,
  StorageWarningPayload,
  AIDetectionCreatedPayload,
  AlertCreatedPayload,
  AlertAcknowledgedPayload,
  BranchHealthChangedPayload,
  EdgeAgentHeartbeatPayload,
  MediaSessionStartedPayload,
  FederationSyncCompletedPayload,
  IncidentCreatedPayload,
} from './event-types.js';

/**
 * Camera Event Emitter
 */
export class CameraEvents {
  constructor(private eventBus: EventBus) {}

  async statusChanged(
    tenantId: string,
    cameraId: string,
    previousStatus: string,
    newStatus: string,
    options?: { branchId?: string; reason?: string; details?: Record<string, unknown> }
  ): Promise<string> {
    const payload: CameraStatusChangedPayload = {
      cameraId,
      previousStatus,
      newStatus,
      reason: options?.reason,
      details: options?.details,
    };

    return this.eventBus.publish(
      EventType.CAMERA_STATUS_CHANGED,
      payload,
      { tenantId, branchId: options?.branchId, deviceId: cameraId }
    );
  }

  async streamFailed(
    tenantId: string,
    cameraId: string,
    streamUrl: string,
    options?: {
      branchId?: string;
      errorCode?: string;
      errorMessage?: string;
      retryAttempt?: number;
      lastSuccessfulStream?: string;
    }
  ): Promise<string> {
    const payload: CameraStreamFailedPayload = {
      cameraId,
      streamUrl,
      ...options,
    };

    return this.eventBus.publish(
      EventType.CAMERA_STREAM_FAILED,
      payload,
      { tenantId, branchId: options?.branchId, deviceId: cameraId }
    );
  }

  async recovered(
    tenantId: string,
    cameraId: string,
    downDuration: number,
    options?: {
      branchId?: string;
      recoveryMethod?: 'automatic' | 'manual' | 'reboot';
      previousIssue?: string;
    }
  ): Promise<string> {
    const payload: CameraRecoveredPayload = {
      cameraId,
      downDuration,
      ...options,
    };

    return this.eventBus.publish(
      EventType.CAMERA_RECOVERED,
      payload,
      { tenantId, branchId: options?.branchId, deviceId: cameraId }
    );
  }
}

/**
 * Recording Event Emitter
 */
export class RecordingEvents {
  constructor(private eventBus: EventBus) {}

  async gapDetected(
    tenantId: string,
    cameraId: string,
    gapStart: string,
    gapEnd: string,
    gapDuration: number,
    options?: {
      branchId?: string;
      expectedRecording?: boolean;
      reason?: 'camera_offline' | 'storage_full' | 'encoder_failure' | 'unknown';
    }
  ): Promise<string> {
    const payload: RecordingGapDetectedPayload = {
      cameraId,
      gapStart,
      gapEnd,
      gapDuration,
      expectedRecording: options?.expectedRecording ?? true,
      reason: options?.reason,
    };

    return this.eventBus.publish(
      EventType.RECORDING_GAP_DETECTED,
      payload,
      { tenantId, branchId: options?.branchId, deviceId: cameraId }
    );
  }

  async started(
    tenantId: string,
    cameraId: string,
    options?: { branchId?: string; recordingId?: string }
  ): Promise<string> {
    return this.eventBus.publish(
      EventType.RECORDING_STARTED,
      { cameraId, recordingId: options?.recordingId },
      { tenantId, branchId: options?.branchId, deviceId: cameraId }
    );
  }

  async stopped(
    tenantId: string,
    cameraId: string,
    options?: { branchId?: string; recordingId?: string; reason?: string }
  ): Promise<string> {
    return this.eventBus.publish(
      EventType.RECORDING_STOPPED,
      { cameraId, recordingId: options?.recordingId, reason: options?.reason },
      { tenantId, branchId: options?.branchId, deviceId: cameraId }
    );
  }
}

/**
 * Storage Event Emitter
 */
export class StorageEvents {
  constructor(private eventBus: EventBus) {}

  async warning(
    tenantId: string,
    deviceId: string,
    totalCapacity: number,
    usedCapacity: number,
    availableCapacity: number,
    usagePercentage: number,
    options?: {
      branchId?: string;
      storageType?: 'local' | 'network' | 'cloud';
      threshold?: 'warning' | 'critical';
      estimatedTimeToFull?: number;
      affectedCameras?: string[];
    }
  ): Promise<string> {
    const payload: StorageWarningPayload = {
      deviceId,
      storageType: options?.storageType || 'local',
      totalCapacity,
      usedCapacity,
      availableCapacity,
      usagePercentage,
      threshold: options?.threshold || 'warning',
      estimatedTimeToFull: options?.estimatedTimeToFull,
      affectedCameras: options?.affectedCameras,
    };

    return this.eventBus.publish(
      EventType.STORAGE_WARNING,
      payload,
      { tenantId, branchId: options?.branchId, deviceId }
    );
  }
}

/**
 * AI/Analytics Event Emitter
 */
export class AIEvents {
  constructor(private eventBus: EventBus) {}

  async detectionCreated(
    tenantId: string,
    detectionId: string,
    detectionType: string,
    cameraId: string,
    confidence: number,
    frameTimestamp: string,
    options?: {
      branchId?: string;
      boundingBox?: { x: number; y: number; width: number; height: number };
      objectClass?: string;
      attributes?: Record<string, unknown>;
      snapshotUrl?: string;
      videoClipUrl?: string;
    }
  ): Promise<string> {
    const payload: AIDetectionCreatedPayload = {
      detectionId,
      detectionType,
      cameraId,
      confidence,
      frameTimestamp,
      ...options,
    };

    return this.eventBus.publish(
      EventType.AI_DETECTION_CREATED,
      payload,
      { tenantId, branchId: options?.branchId, deviceId: cameraId }
    );
  }

  async personDetected(
    tenantId: string,
    cameraId: string,
    confidence: number,
    options?: { branchId?: string; attributes?: Record<string, unknown> }
  ): Promise<string> {
    return this.eventBus.publish(
      EventType.AI_PERSON_DETECTED,
      { cameraId, confidence, attributes: options?.attributes },
      { tenantId, branchId: options?.branchId, deviceId: cameraId }
    );
  }

  async vehicleDetected(
    tenantId: string,
    cameraId: string,
    confidence: number,
    options?: { branchId?: string; vehicleType?: string; attributes?: Record<string, unknown> }
  ): Promise<string> {
    return this.eventBus.publish(
      EventType.AI_VEHICLE_DETECTED,
      { cameraId, confidence, vehicleType: options?.vehicleType, attributes: options?.attributes },
      { tenantId, branchId: options?.branchId, deviceId: cameraId }
    );
  }
}

/**
 * Alert Event Emitter
 */
export class AlertEvents {
  constructor(private eventBus: EventBus) {}

  async created(
    tenantId: string,
    alertId: string,
    alertType: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    title: string,
    description: string,
    options?: {
      branchId?: string;
      deviceId?: string;
      sourceEventId?: string;
      affectedDevices?: string[];
      recommendedActions?: string[];
      autoAcknowledge?: boolean;
      expiresAt?: string;
    }
  ): Promise<string> {
    const payload: AlertCreatedPayload = {
      alertId,
      alertType,
      severity,
      title,
      description,
      ...options,
    };

    return this.eventBus.publish(
      EventType.ALERT_CREATED,
      payload,
      { tenantId, branchId: options?.branchId, deviceId: options?.deviceId }
    );
  }

  async acknowledged(
    tenantId: string,
    alertId: string,
    acknowledgedBy: string,
    options?: {
      branchId?: string;
      notes?: string;
      assignedTo?: string;
    }
  ): Promise<string> {
    const payload: AlertAcknowledgedPayload = {
      alertId,
      acknowledgedBy,
      acknowledgedAt: new Date().toISOString(),
      notes: options?.notes,
      assignedTo: options?.assignedTo,
    };

    return this.eventBus.publish(
      EventType.ALERT_ACKNOWLEDGED,
      payload,
      { tenantId, branchId: options?.branchId, userId: acknowledgedBy }
    );
  }

  async resolved(
    tenantId: string,
    alertId: string,
    resolvedBy: string,
    options?: { branchId?: string; resolution?: string }
  ): Promise<string> {
    return this.eventBus.publish(
      EventType.ALERT_RESOLVED,
      { alertId, resolvedBy, resolvedAt: new Date().toISOString(), resolution: options?.resolution },
      { tenantId, branchId: options?.branchId, userId: resolvedBy }
    );
  }
}

/**
 * Branch Health Event Emitter
 */
export class BranchEvents {
  constructor(private eventBus: EventBus) {}

  async healthChanged(
    tenantId: string,
    branchId: string,
    previousHealth: 'healthy' | 'degraded' | 'critical' | 'offline',
    newHealth: 'healthy' | 'degraded' | 'critical' | 'offline',
    options?: {
      healthScore?: number;
      affectedSystems?: string[];
      metrics?: {
        camerasOnline: number;
        camerasTotal: number;
        recordingActive: boolean;
        networkLatency?: number;
        bandwidthUsage?: number;
      };
    }
  ): Promise<string> {
    const payload: BranchHealthChangedPayload = {
      branchId,
      previousHealth,
      newHealth,
      ...options,
    };

    return this.eventBus.publish(
      EventType.BRANCH_HEALTH_CHANGED,
      payload,
      { tenantId, branchId }
    );
  }
}

/**
 * Edge Agent Event Emitter
 */
export class EdgeAgentEvents {
  constructor(private eventBus: EventBus) {}

  async heartbeat(
    tenantId: string,
    agentId: string,
    version: string,
    uptime: number,
    cpuUsage: number,
    memoryUsage: number,
    diskUsage: number,
    activeCameras: number,
    activeStreams: number,
    networkStatus: 'online' | 'degraded' | 'offline',
    options?: { branchId?: string; lastDiscoveryAt?: string }
  ): Promise<string> {
    const payload: EdgeAgentHeartbeatPayload = {
      agentId,
      version,
      uptime,
      cpuUsage,
      memoryUsage,
      diskUsage,
      activeCameras,
      activeStreams,
      networkStatus,
      lastDiscoveryAt: options?.lastDiscoveryAt,
    };

    return this.eventBus.publish(
      EventType.EDGE_AGENT_HEARTBEAT,
      payload,
      { tenantId, branchId: options?.branchId, deviceId: agentId }
    );
  }

  async connected(
    tenantId: string,
    agentId: string,
    options?: { branchId?: string; version?: string }
  ): Promise<string> {
    return this.eventBus.publish(
      EventType.EDGE_AGENT_CONNECTED,
      { agentId, version: options?.version },
      { tenantId, branchId: options?.branchId, deviceId: agentId }
    );
  }

  async disconnected(
    tenantId: string,
    agentId: string,
    options?: { branchId?: string; reason?: string }
  ): Promise<string> {
    return this.eventBus.publish(
      EventType.EDGE_AGENT_DISCONNECTED,
      { agentId, reason: options?.reason },
      { tenantId, branchId: options?.branchId, deviceId: agentId }
    );
  }
}

/**
 * Media Gateway Event Emitter
 */
export class MediaEvents {
  constructor(private eventBus: EventBus) {}

  async sessionStarted(
    tenantId: string,
    sessionId: string,
    cameraId: string,
    userId: string,
    protocol: 'webrtc' | 'hls' | 'rtsp' | 'mjpeg',
    quality: 'low' | 'medium' | 'high' | 'adaptive',
    options?: { branchId?: string; gatewayId?: string }
  ): Promise<string> {
    const payload: MediaSessionStartedPayload = {
      sessionId,
      cameraId,
      userId,
      protocol,
      quality,
      gatewayId: options?.gatewayId,
    };

    return this.eventBus.publish(
      EventType.MEDIA_SESSION_STARTED,
      payload,
      { tenantId, branchId: options?.branchId, deviceId: cameraId, userId }
    );
  }

  async sessionEnded(
    tenantId: string,
    sessionId: string,
    options?: { branchId?: string; duration?: number; reason?: string }
  ): Promise<string> {
    return this.eventBus.publish(
      EventType.MEDIA_SESSION_ENDED,
      { sessionId, duration: options?.duration, reason: options?.reason },
      { tenantId, branchId: options?.branchId }
    );
  }
}

/**
 * Federation Event Emitter
 */
export class FederationEvents {
  constructor(private eventBus: EventBus) {}

  async syncCompleted(
    tenantId: string,
    syncId: string,
    sourceServerId: string,
    targetServerId: string,
    syncType: 'full' | 'incremental',
    duration: number,
    entitiesSynced: {
      cameras?: number;
      alerts?: number;
      users?: number;
      configurations?: number;
    },
    options?: { errors?: string[] }
  ): Promise<string> {
    const payload: FederationSyncCompletedPayload = {
      syncId,
      sourceServerId,
      targetServerId,
      syncType,
      duration,
      entitiesSynced,
      errors: options?.errors,
    };

    return this.eventBus.publish(
      EventType.FEDERATION_SYNC_COMPLETED,
      payload,
      { tenantId }
    );
  }
}

/**
 * Incident Event Emitter
 */
export class IncidentEvents {
  constructor(private eventBus: EventBus) {}

  async created(
    tenantId: string,
    incidentId: string,
    incidentType: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    title: string,
    description: string,
    requiresInvestigation: boolean,
    options?: {
      branchId?: string;
      sourceAlertIds?: string[];
      sourceDetectionIds?: string[];
      affectedCameras?: string[];
      affectedBranches?: string[];
      createdBy?: 'system' | 'user';
    }
  ): Promise<string> {
    const payload: IncidentCreatedPayload = {
      incidentId,
      incidentType,
      severity,
      title,
      description,
      requiresInvestigation,
      ...options,
    };

    return this.eventBus.publish(
      EventType.INCIDENT_CREATED,
      payload,
      { tenantId, branchId: options?.branchId }
    );
  }
}

/**
 * Combined Event Emitters - single entry point
 */
export class EventEmitters {
  camera: CameraEvents;
  recording: RecordingEvents;
  storage: StorageEvents;
  ai: AIEvents;
  alert: AlertEvents;
  branch: BranchEvents;
  edgeAgent: EdgeAgentEvents;
  media: MediaEvents;
  federation: FederationEvents;
  incident: IncidentEvents;

  constructor(eventBus: EventBus) {
    this.camera = new CameraEvents(eventBus);
    this.recording = new RecordingEvents(eventBus);
    this.storage = new StorageEvents(eventBus);
    this.ai = new AIEvents(eventBus);
    this.alert = new AlertEvents(eventBus);
    this.branch = new BranchEvents(eventBus);
    this.edgeAgent = new EdgeAgentEvents(eventBus);
    this.media = new MediaEvents(eventBus);
    this.federation = new FederationEvents(eventBus);
    this.incident = new IncidentEvents(eventBus);
  }
}
