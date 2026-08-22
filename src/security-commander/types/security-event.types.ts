/**
 * AI Security Commander - Unified Security Event Model
 * 
 * This module defines the common vocabulary for all security events across:
 * - Cameras, DVRs/NVRs
 * - Access control systems
 * - Network devices
 * - Storage systems
 * - AI detections
 * - System telemetry
 */

/**
 * All possible security event types across the platform
 */
export type SecurityEventType =
  // Camera events
  | 'camera.offline'
  | 'camera.online'
  | 'camera.tamper'
  | 'camera.motion'
  | 'camera.stream_lost'
  | 'camera.stream_restored'
  | 'camera.exposure_issue'
  | 'camera.focus_issue'
  | 'camera.blocking'
  | 'camera.night_vision_failure'

  // AI detection events
  | 'ai.person_detected'
  | 'ai.vehicle_detected'
  | 'ai.intrusion'
  | 'ai.loitering'
  | 'ai.crowd_detected'
  | 'ai.face_match'
  | 'ai.face_unknown'
  | 'ai.fire_detected'
  | 'ai.smoke_detected'
  | 'ai.ppe_violation'
  | 'ai.weapon_detected'
  | 'ai.fall_detected'
  | 'ai.tailgating'
  | 'ai.queue_detected'
  | 'ai.unattended_object'
  | 'ai.removed_object'
  | 'ai.line_crossing'
  | 'ai.perimeter_breach'

  // Access control events
  | 'access.granted'
  | 'access.denied'
  | 'access.door_forced'
  | 'access.door_held_open'
  | 'access.door_propped'
  | 'access.badge_expired'
  | 'access.badge_invalid'
  | 'access.duress_code'
  | 'access.multiple_failed_attempts'
  | 'access.antipassback_violation'

  // Recorder/NVR events
  | 'recorder.offline'
  | 'recorder.online'
  | 'recorder.recording_stopped'
  | 'recorder.recording_started'
  | 'recorder.channel_missing'
  | 'recorder.channel_restored'
  | 'recorder.authentication_failure'
  | 'recorder.disk_error'

  // Storage events
  | 'storage.low'
  | 'storage.critical'
  | 'storage.full'
  | 'storage.disk_failed'
  | 'storage.raid_degraded'
  | 'storage.write_error'
  | 'storage.archive_failed'

  // Network events
  | 'network.device_unreachable'
  | 'network.device_reachable'
  | 'network.packet_loss'
  | 'network.high_latency'
  | 'network.bandwidth_exceeded'
  | 'network.link_down'
  | 'network.link_up'
  | 'network.switch_failure'
  | 'network.port_security_violation'

  // Security system events
  | 'security.auth_failure'
  | 'security.unauthorized_access_attempt'
  | 'security.configuration_changed'
  | 'security.privilege_escalation'
  | 'security.suspicious_activity'
  | 'security.data_export'
  | 'security.firmware_tamper';

/**
 * Severity levels for security events
 */
export type SecuritySeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/**
 * Source types for security events
 */
export type SecurityEventSourceType =
  | 'camera'
  | 'recorder'
  | 'access-controller'
  | 'network-device'
  | 'storage'
  | 'ai'
  | 'system'
  | 'sensor';

/**
 * Location information for events
 */
export interface SecurityEventLocation {
  building?: string;
  floor?: string;
  zone?: string;
  zoneId?: string;
  area?: string;
  latitude?: number;
  longitude?: number;
  coordinates?: {
    x?: number;
    y?: number;
  };
}

/**
 * Entity references involved in the event
 */
export interface SecurityEventEntities {
  cameraId?: string;
  recorderId?: string;
  doorId?: string;
  personId?: string;
  badgeId?: string;
  vehicleId?: string;
  userId?: string;
  deviceId?: string;
  networkDeviceId?: string;
  storageId?: string;
  zoneId?: string;
}

/**
 * Evidence attached to the event
 */
export interface SecurityEventEvidence {
  snapshotId?: string;
  snapshotUrl?: string;
  clipId?: string;
  clipUrl?: string;
  recordingTimestamp?: Date;
  logIds?: string[];
  hash?: string;
  hashAlgorithm?: string;
}

/**
 * Unified Security Event - The common envelope for all security telemetry
 */
export interface SecurityEvent {
  /** Unique event identifier */
  id: string;

  /** Event type from the unified vocabulary */
  type: SecurityEventType;

  /** When the event occurred */
  timestamp: Date;

  /** Tenant/organization identifier */
  tenantId: string;

  /** Enterprise identifier */
  enterpriseId?: string;

  /** Region identifier */
  regionId?: string;

  /** Branch/site identifier */
  branchId?: string;

  /** Source of the event */
  source: {
    type: SecurityEventSourceType;
    id: string;
    name?: string;
  };

  /** Event severity */
  severity: SecuritySeverity;

  /** Confidence score (0.0 - 1.0) for AI/detected events */
  confidence?: number;

  /** Abnormality score (0.0 - 1.0) computed by anomaly engine */
  abnormalityScore?: number;

  /** Location information */
  location?: SecurityEventLocation;

  /** Entity references */
  entities?: SecurityEventEntities;

  /** Evidence attachments */
  evidence?: SecurityEventEvidence;

  /** Additional metadata */
  metadata: Record<string, unknown>;

  /** Correlation ID for grouping related events */
  correlationId?: string;

  /** Investigation ID if part of an investigation */
  investigationId?: string;

  /** Incident ID if correlated into an incident */
  incidentId?: string;

  /** When the event was ingested */
  ingestedAt?: Date;

  /** When the event was created in the database */
  createdAt?: Date;
}

/**
 * Event creation input (before normalization)
 */
export interface CreateSecurityEventInput {
  type: SecurityEventType;
  timestamp: Date;
  tenantId: string;
  enterpriseId?: string;
  regionId?: string;
  branchId?: string;
  source: {
    type: SecurityEventSourceType;
    id: string;
    name?: string;
  };
  severity: SecuritySeverity;
  confidence?: number;
  location?: SecurityEventLocation;
  entities?: SecurityEventEntities;
  evidence?: SecurityEventEvidence;
  metadata?: Record<string, unknown>;
}

/**
 * Event query filters
 */
export interface SecurityEventQuery {
  tenantId: string;
  enterpriseId?: string;
  regionId?: string;
  branchId?: string;
  branchIds?: string[];
  cameraIds?: string[];
  from?: Date;
  to?: Date;
  types?: SecurityEventType[];
  severities?: SecuritySeverity[];
  sourceTypes?: SecurityEventSourceType[];
  abnormalOnly?: boolean;
  minAbnormalityScore?: number;
  correlationId?: string;
  investigationId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Event statistics
 */
export interface SecurityEventStats {
  total: number;
  bySeverity: Record<SecuritySeverity, number>;
  byType: Record<string, number>;
  bySource: Record<string, number>;
  abnormalCount: number;
}
