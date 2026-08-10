/**
 * Security Posture Telemetry Contracts
 * 
 * Defines the core types for security telemetry collection,
 * observation reporting, and availability tracking.
 */

/**
 * Telemetry availability states
 */
export type TelemetryAvailability =
  | 'available'      // Data successfully collected
  | 'unavailable'    // Collection failed (network, auth, timeout)
  | 'degraded'       // Partial data collected
  | 'unsupported'    // Device/feature doesn't support this telemetry
  | 'not_configured'; // Collector exists but not configured

/**
 * Collection execution status
 */
export type CollectionStatus =
  | 'success'
  | 'partial'
  | 'timeout'
  | 'authentication_failed'
  | 'connection_failed'
  | 'collector_missing'
  | 'unsupported'
  | 'not_configured';

/**
 * Standard error codes for telemetry collection
 */
export enum TelemetryErrorCode {
  COLLECTOR_NOT_IMPLEMENTED = 'COLLECTOR_NOT_IMPLEMENTED',
  COLLECTOR_NOT_CONFIGURED = 'COLLECTOR_NOT_CONFIGURED',
  DEVICE_UNSUPPORTED = 'DEVICE_UNSUPPORTED',
  AGENT_UNAVAILABLE = 'AGENT_UNAVAILABLE',
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  DEVICE_OFFLINE = 'DEVICE_OFFLINE',
  MALFORMED_RESPONSE = 'MALFORMED_RESPONSE',
  KMS_SEALED = 'KMS_SEALED',
  CERTIFICATE_MISSING = 'CERTIFICATE_MISSING',
  ATTESTATION_FAILED = 'ATTESTATION_FAILED',
  STALE_TELEMETRY = 'STALE_TELEMETRY',
}

/**
 * Quality metrics for telemetry data
 */
export interface TelemetryQuality {
  /** How confident we are in the observation (0-1) */
  confidence: number;
  
  /** How recent the data is (0-1, 1 = fresh) */
  freshness: number;
  
  /** How complete the observation is (0-1) */
  completeness: number;
}

/**
 * Entity reference for telemetry scope
 */
export interface EntityRef {
  entityType: 'enterprise' | 'region' | 'site' | 'network' | 'server' | 'recorder' | 'camera';
  entityId: string;
}

/**
 * Result of a telemetry collection operation
 */
export interface SecurityTelemetryResult<T = unknown> {
  /** The collected value (if available) */
  value?: T;
  
  /** Whether data was successfully collected */
  available: boolean;
  
  /** Detailed availability status */
  availability: TelemetryAvailability;
  
  /** Collection execution status */
  collectionStatus: CollectionStatus;
  
  /** Source system/collector name */
  source: string;
  
  /** When the observation was made by the source system */
  observedAt: Date;
  
  /** When we collected/received the data */
  collectedAt: Date;
  
  /** Quality metrics */
  quality: TelemetryQuality;
  
  /** Machine-readable error code */
  errorCode?: TelemetryErrorCode | string;
  
  /** Human-readable error message */
  errorMessage?: string;
  
  /** Supporting evidence for investigation */
  evidence?: Record<string, unknown>;
  
  /** Entity this telemetry applies to */
  entity?: EntityRef;
}

/**
 * Helper to create unavailable result
 */
export function createUnavailableResult<T>(
  source: string,
  errorCode: TelemetryErrorCode | string,
  errorMessage: string,
  availability: TelemetryAvailability = 'unavailable'
): SecurityTelemetryResult<T> {
  return {
    available: false,
    availability,
    collectionStatus: 'collector_missing',
    source,
    observedAt: new Date(),
    collectedAt: new Date(),
    quality: {
      confidence: 0,
      freshness: 0,
      completeness: 0,
    },
    errorCode,
    errorMessage,
  };
}

/**
 * Helper to create successful result
 */
export function createSuccessResult<T>(
  source: string,
  value: T,
  observedAt: Date = new Date(),
  options: {
    confidence?: number;
    freshness?: number;
    completeness?: number;
    evidence?: Record<string, unknown>;
    entity?: EntityRef;
  } = {}
): SecurityTelemetryResult<T> {
  return {
    value,
    available: true,
    availability: 'available',
    collectionStatus: 'success',
    source,
    observedAt,
    collectedAt: new Date(),
    quality: {
      confidence: options.confidence ?? 1.0,
      freshness: options.freshness ?? 1.0,
      completeness: options.completeness ?? 1.0,
    },
    evidence: options.evidence,
    entity: options.entity,
  };
}
