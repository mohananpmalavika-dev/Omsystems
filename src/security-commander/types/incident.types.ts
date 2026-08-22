/**
 * AI Security Commander - Incident Types
 * 
 * Incidents are correlated security events that represent
 * a meaningful security situation requiring attention.
 */

import type { SecuritySeverity, SecurityEvent } from './security-event.types.js';

/**
 * Incident types (correlated event patterns)
 */
export type IncidentType =
  // Physical security incidents
  | 'security.unauthorized_entry'
  | 'security.forced_entry'
  | 'security.tailgating_confirmed'
  | 'security.intrusion_with_camera_confirmation'
  | 'security.perimeter_breach'
  | 'security.loitering_suspicious'
  | 'security.after_hours_activity'

  // Access control incidents
  | 'access.multiple_failed_attempts'
  | 'access.badge_cloning_suspected'
  | 'access.impossible_travel'
  | 'access.credential_anomaly'

  // Safety incidents
  | 'safety.fire_alarm'
  | 'safety.smoke_detected'
  | 'safety.person_down'
  | 'safety.ppe_violation_repeated'
  | 'safety.emergency_exit_blocked'

  // Infrastructure incidents
  | 'infrastructure.camera_tampering'
  | 'infrastructure.recording_failure'
  | 'infrastructure.network_cascade'
  | 'infrastructure.storage_failure'
  | 'infrastructure.power_failure'
  | 'infrastructure.systematic_offline'

  // Security system incidents
  | 'system.authentication_attack'
  | 'system.configuration_tampering'
  | 'system.data_exfiltration'
  | 'system.privilege_abuse';

/**
 * Incident status
 */
export type IncidentStatus =
  | 'open'
  | 'investigating'
  | 'escalated'
  | 'resolved'
  | 'dismissed'
  | 'false_positive';

/**
 * Asset reference
 */
export interface AssetReference {
  type: 'camera' | 'recorder' | 'door' | 'zone' | 'device' | 'storage' | 'network-device';
  id: string;
  name?: string;
  location?: string;
}

/**
 * Correlated Incident
 */
export interface Incident {
  /** Unique incident identifier */
  id: string;

  /** Tenant identifier */
  tenantId: string;

  /** Incident type */
  type: IncidentType;

  /** Title/summary */
  title: string;

  /** Detailed description */
  description?: string;

  /** Severity (inherited from events or calculated) */
  severity: SecuritySeverity;

  /** Confidence score (0.0 - 1.0) */
  confidence: number;

  /** Incident status */
  status: IncidentStatus;

  /** When the incident started */
  startedAt: Date;

  /** When the incident ended (if resolved) */
  endedAt?: Date;

  /** Duration in seconds */
  durationSeconds?: number;

  /** Branch/site where incident occurred */
  branchId?: string;

  /** Zone where incident occurred */
  zoneId?: string;

  /** IDs of correlated events */
  eventIds: string[];

  /** Number of events in this incident */
  eventCount: number;

  /** Affected assets */
  affectedAssets: AssetReference[];

  /** Evidence IDs */
  evidenceIds: string[];

  /** Generated explanation */
  explanation: string;

  /** Root cause (if determined) */
  rootCause?: {
    description: string;
    confidence: number;
    sourceEventId?: string;
  };

  /** Correlation fingerprint (for deduplication) */
  fingerprint?: string;

  /** Investigation ID if part of investigation */
  investigationId?: string;

  /** Assigned to user */
  assignedTo?: string;

  /** Additional metadata */
  metadata: Record<string, unknown>;

  /** Created timestamp */
  createdAt: Date;

  /** Last updated timestamp */
  updatedAt: Date;
}

/**
 * Incident creation input
 */
export interface CreateIncidentInput {
  tenantId: string;
  type: IncidentType;
  title: string;
  description?: string;
  severity: SecuritySeverity;
  confidence: number;
  startedAt: Date;
  branchId?: string;
  zoneId?: string;
  eventIds: string[];
  affectedAssets: AssetReference[];
  evidenceIds: string[];
  explanation: string;
  rootCause?: {
    description: string;
    confidence: number;
    sourceEventId?: string;
  };
  fingerprint?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Incident summary for display
 */
export interface IncidentSummary {
  id: string;
  type: IncidentType;
  title: string;
  severity: SecuritySeverity;
  confidence: number;
  status: IncidentStatus;
  startedAt: Date;
  branchId?: string;
  branchName?: string;
  location?: string;
  eventCount: number;
  evidenceCount: number;
  explanation: string;
}

/**
 * Incident query filters
 */
export interface IncidentQuery {
  tenantId: string;
  branchId?: string;
  branchIds?: string[];
  types?: IncidentType[];
  severities?: SecuritySeverity[];
  statuses?: IncidentStatus[];
  from?: Date;
  to?: Date;
  minConfidence?: number;
  investigationId?: string;
  assignedTo?: string;
  limit?: number;
  offset?: number;
}

/**
 * Incident statistics
 */
export interface IncidentStats {
  total: number;
  open: number;
  investigating: number;
  resolved: number;
  dismissed: number;
  bySeverity: Record<SecuritySeverity, number>;
  byType: Record<string, number>;
}
