/**
 * Event Bus Type Definitions
 * Defines all event types and schemas for the Sentinel Grid system
 */

/**
 * Base event structure - all events must conform to this
 */
export interface BaseEvent<T = unknown> {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  tenantId: string;
  branchId?: string;
  deviceId?: string;
  timestamp: string; // ISO 8601
  source: string; // Service that emitted the event
  correlationId?: string; // For tracing related events
  causationId?: string; // Event that caused this event
  userId?: string; // User who triggered the event (if applicable)
  metadata?: {
    traceId?: string;
    spanId?: string;
    [key: string]: unknown;
  };
  payload: T;
}

/**
 * Event types - centralized registry of all event types
 */
export enum EventType {
  // Camera Events
  CAMERA_REGISTERED = 'sentinel.camera.registered',
  CAMERA_STATUS_CHANGED = 'sentinel.camera.status.changed',
  CAMERA_STREAM_STARTED = 'sentinel.camera.stream.started',
  CAMERA_STREAM_FAILED = 'sentinel.camera.stream.failed',
  CAMERA_RECOVERED = 'sentinel.camera.recovered',
  CAMERA_DISCONNECTED = 'sentinel.camera.disconnected',
  CAMERA_RECONNECTED = 'sentinel.camera.reconnected',
  CAMERA_CREDENTIALS_UPDATED = 'sentinel.camera.credentials.updated',
  CAMERA_HEALTH_DEGRADED = 'sentinel.camera.health.degraded',
  CAMERA_AGING_DETECTED = 'sentinel.camera.aging.detected',
  
  // Recording Events
  RECORDING_STARTED = 'sentinel.recording.started',
  RECORDING_STOPPED = 'sentinel.recording.stopped',
  RECORDING_GAP_DETECTED = 'sentinel.recording.gap.detected',
  RECORDING_FAILED = 'sentinel.recording.failed',
  RECORDING_RECOVERED = 'sentinel.recording.recovered',
  RECORDING_RETENTION_EXPIRING = 'sentinel.recording.retention.expiring',
  
  // Storage Events
  STORAGE_WARNING = 'sentinel.storage.warning',
  STORAGE_CRITICAL = 'sentinel.storage.critical',
  STORAGE_CLEANUP_COMPLETED = 'sentinel.storage.cleanup.completed',
  STORAGE_DISK_FAILURE = 'sentinel.storage.disk.failure',
  STORAGE_RAID_DEGRADED = 'sentinel.storage.raid.degraded',
  
  // AI/Analytics Events
  AI_DETECTION_CREATED = 'sentinel.ai.detection.created',
  AI_PERSON_DETECTED = 'sentinel.ai.person.detected',
  AI_VEHICLE_DETECTED = 'sentinel.ai.vehicle.detected',
  AI_FACE_DETECTED = 'sentinel.ai.face.detected',
  AI_BEHAVIOR_ANOMALY = 'sentinel.ai.behavior.anomaly',
  AI_CROWD_THRESHOLD_EXCEEDED = 'sentinel.ai.crowd.threshold.exceeded',
  AI_OBJECT_UNATTENDED = 'sentinel.ai.object.unattended',
  AI_ZONE_INTRUSION = 'sentinel.ai.zone.intrusion',
  AI_FALL_DETECTED = 'sentinel.ai.fall.detected',
  AI_SMOKE_FIRE_DETECTED = 'sentinel.ai.smoke.fire.detected',
  
  // Alert Events
  ALERT_CREATED = 'sentinel.alert.created',
  ALERT_ACKNOWLEDGED = 'sentinel.alert.acknowledged',
  ALERT_RESOLVED = 'sentinel.alert.resolved',
  ALERT_ESCALATED = 'sentinel.alert.escalated',
  ALERT_SNOOZED = 'sentinel.alert.snoozed',
  ALERT_SUPPRESSED = 'sentinel.alert.suppressed',
  
  // Branch/Site Events
  BRANCH_HEALTH_CHANGED = 'sentinel.branch.health.changed',
  BRANCH_OFFLINE = 'sentinel.branch.offline',
  BRANCH_ONLINE = 'sentinel.branch.online',
  BRANCH_NETWORK_DEGRADED = 'sentinel.branch.network.degraded',
  BRANCH_BANDWIDTH_WARNING = 'sentinel.branch.bandwidth.warning',
  
  // Edge Agent Events
  EDGE_AGENT_REGISTERED = 'sentinel.edge.agent.registered',
  EDGE_AGENT_CONNECTED = 'sentinel.edge.agent.connected',
  EDGE_AGENT_DISCONNECTED = 'sentinel.edge.agent.disconnected',
  EDGE_AGENT_HEARTBEAT = 'sentinel.edge.agent.heartbeat',
  EDGE_AGENT_UPDATE_AVAILABLE = 'sentinel.edge.agent.update.available',
  EDGE_AGENT_UPDATE_APPLIED = 'sentinel.edge.agent.update.applied',
  EDGE_AGENT_DISCOVERY_COMPLETED = 'sentinel.edge.agent.discovery.completed',
  
  // Media Gateway Events
  MEDIA_SESSION_STARTED = 'sentinel.media.session.started',
  MEDIA_SESSION_ENDED = 'sentinel.media.session.ended',
  MEDIA_STREAM_ERROR = 'sentinel.media.stream.error',
  MEDIA_GATEWAY_OVERLOAD = 'sentinel.media.gateway.overload',
  
  // Federation Events
  FEDERATION_SERVER_JOINED = 'sentinel.federation.server.joined',
  FEDERATION_SERVER_LEFT = 'sentinel.federation.server.left',
  FEDERATION_SYNC_STARTED = 'sentinel.federation.sync.started',
  FEDERATION_SYNC_COMPLETED = 'sentinel.federation.sync.completed',
  FEDERATION_SYNC_FAILED = 'sentinel.federation.sync.failed',
  
  // User/Auth Events
  USER_LOGGED_IN = 'sentinel.user.logged.in',
  USER_LOGGED_OUT = 'sentinel.user.logged.out',
  USER_SESSION_EXPIRED = 'sentinel.user.session.expired',
  USER_PERMISSION_CHANGED = 'sentinel.user.permission.changed',
  
  // System Events
  SYSTEM_BACKUP_COMPLETED = 'sentinel.system.backup.completed',
  SYSTEM_BACKUP_FAILED = 'sentinel.system.backup.failed',
  SYSTEM_MAINTENANCE_STARTED = 'sentinel.system.maintenance.started',
  SYSTEM_MAINTENANCE_COMPLETED = 'sentinel.system.maintenance.completed',
  SYSTEM_HEALTH_CHECK_FAILED = 'sentinel.system.health.check.failed',
  
  // Incident Events
  INCIDENT_CREATED = 'sentinel.incident.created',
  INCIDENT_UPDATED = 'sentinel.incident.updated',
  INCIDENT_RESOLVED = 'sentinel.incident.resolved',
  INCIDENT_INVESTIGATION_STARTED = 'sentinel.incident.investigation.started',
  INCIDENT_INVESTIGATION_COMPLETED = 'sentinel.incident.investigation.completed',
}

/**
 * Event Payload Types
 */

export interface CameraStatusChangedPayload {
  cameraId: string;
  previousStatus: string;
  newStatus: string;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface CameraStreamFailedPayload {
  cameraId: string;
  streamUrl: string;
  errorCode?: string;
  errorMessage?: string;
  retryAttempt?: number;
  lastSuccessfulStream?: string;
}

export interface CameraRecoveredPayload {
  cameraId: string;
  downDuration: number; // milliseconds
  recoveryMethod?: 'automatic' | 'manual' | 'reboot';
  previousIssue?: string;
}

export interface RecordingGapDetectedPayload {
  cameraId: string;
  gapStart: string;
  gapEnd: string;
  gapDuration: number; // seconds
  expectedRecording: boolean;
  reason?: 'camera_offline' | 'storage_full' | 'encoder_failure' | 'unknown';
}

export interface StorageWarningPayload {
  deviceId: string;
  storageType: 'local' | 'network' | 'cloud';
  totalCapacity: number; // bytes
  usedCapacity: number; // bytes
  availableCapacity: number; // bytes
  usagePercentage: number;
  threshold: 'warning' | 'critical';
  estimatedTimeToFull?: number; // hours
  affectedCameras?: string[];
}

export interface AIDetectionCreatedPayload {
  detectionId: string;
  detectionType: string;
  cameraId: string;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  objectClass?: string;
  attributes?: Record<string, unknown>;
  frameTimestamp: string;
  snapshotUrl?: string;
  videoClipUrl?: string;
}

export interface AlertCreatedPayload {
  alertId: string;
  alertType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  sourceEventId?: string;
  affectedDevices?: string[];
  recommendedActions?: string[];
  autoAcknowledge?: boolean;
  expiresAt?: string;
}

export interface AlertAcknowledgedPayload {
  alertId: string;
  acknowledgedBy: string;
  acknowledgedAt: string;
  notes?: string;
  assignedTo?: string;
}

export interface BranchHealthChangedPayload {
  branchId: string;
  previousHealth: 'healthy' | 'degraded' | 'critical' | 'offline';
  newHealth: 'healthy' | 'degraded' | 'critical' | 'offline';
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

export interface EdgeAgentHeartbeatPayload {
  agentId: string;
  version: string;
  uptime: number; // seconds
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  activeCameras: number;
  activeStreams: number;
  networkStatus: 'online' | 'degraded' | 'offline';
  lastDiscoveryAt?: string;
}

export interface MediaSessionStartedPayload {
  sessionId: string;
  cameraId: string;
  userId: string;
  protocol: 'webrtc' | 'hls' | 'rtsp' | 'mjpeg';
  quality: 'low' | 'medium' | 'high' | 'adaptive';
  gatewayId?: string;
}

export interface FederationSyncCompletedPayload {
  syncId: string;
  sourceServerId: string;
  targetServerId: string;
  syncType: 'full' | 'incremental';
  duration: number; // milliseconds
  entitiesSynced: {
    cameras?: number;
    alerts?: number;
    users?: number;
    configurations?: number;
  };
  errors?: string[];
}

export interface IncidentCreatedPayload {
  incidentId: string;
  incidentType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  sourceAlertIds?: string[];
  sourceDetectionIds?: string[];
  affectedCameras?: string[];
  affectedBranches?: string[];
  createdBy?: 'system' | 'user';
  requiresInvestigation: boolean;
}

/**
 * Type mapping for event payloads
 */
export type EventPayloadMap = {
  [EventType.CAMERA_STATUS_CHANGED]: CameraStatusChangedPayload;
  [EventType.CAMERA_STREAM_FAILED]: CameraStreamFailedPayload;
  [EventType.CAMERA_RECOVERED]: CameraRecoveredPayload;
  [EventType.RECORDING_GAP_DETECTED]: RecordingGapDetectedPayload;
  [EventType.STORAGE_WARNING]: StorageWarningPayload;
  [EventType.AI_DETECTION_CREATED]: AIDetectionCreatedPayload;
  [EventType.ALERT_CREATED]: AlertCreatedPayload;
  [EventType.ALERT_ACKNOWLEDGED]: AlertAcknowledgedPayload;
  [EventType.BRANCH_HEALTH_CHANGED]: BranchHealthChangedPayload;
  [EventType.EDGE_AGENT_HEARTBEAT]: EdgeAgentHeartbeatPayload;
  [EventType.MEDIA_SESSION_STARTED]: MediaSessionStartedPayload;
  [EventType.FEDERATION_SYNC_COMPLETED]: FederationSyncCompletedPayload;
  [EventType.INCIDENT_CREATED]: IncidentCreatedPayload;
  // Add more mappings as needed
};

/**
 * Helper type to create properly typed events
 */
export type TypedEvent<T extends keyof EventPayloadMap> = BaseEvent<EventPayloadMap[T]>;

/**
 * Event handler function type
 */
export type EventHandler<T extends EventType = EventType> = (
  event: T extends keyof EventPayloadMap ? BaseEvent<EventPayloadMap[T]> : BaseEvent
) => Promise<void> | void;

/**
 * Event subscription options
 */
export interface SubscriptionOptions {
  tenantId?: string;
  branchId?: string;
  deviceId?: string;
  priority?: number;
  retryOnFailure?: boolean;
  maxRetries?: number;
  deadLetterQueue?: boolean;
}

/**
 * Event publishing options
 */
export interface PublishOptions {
  delay?: number; // milliseconds
  persistent?: boolean;
  priority?: number;
  correlationId?: string;
  causationId?: string;
}
