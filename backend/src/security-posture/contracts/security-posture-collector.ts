/**
 * Security Posture Collector Contract
 * 
 * Defines the interface that all security posture adapters must implement.
 */

import { SecurityTelemetryResult } from './telemetry-result';
import { SecurityTelemetryContext } from './telemetry-context';

/**
 * Capability descriptor for collector features
 */
export interface SecurityCapability {
  /** Capability name/identifier */
  name: string;
  
  /** Whether this capability is supported */
  supported: boolean;
  
  /** Reason if unsupported */
  reason?: string;
  
  /** Required configuration */
  requiresConfiguration?: boolean;
}

/**
 * Base interface for security posture collectors
 */
export interface SecurityPostureCollector<T = unknown> {
  /**
   * Collect telemetry for the given context
   */
  collect(context: SecurityTelemetryContext): Promise<SecurityTelemetryResult<T>[]>;
  
  /**
   * Query what capabilities this collector supports for the given context
   */
  capabilities(context: SecurityTelemetryContext): Promise<SecurityCapability[]>;
}

/**
 * Extended collector with health reporting
 */
export interface HealthAwareCollector extends SecurityPostureCollector {
  /**
   * Get collector health status
   */
  getHealth(): Promise<CollectorHealth>;
}

/**
 * Collector health information
 */
export interface CollectorHealth {
  /** Collector identifier */
  collectorId: string;
  
  /** Current status */
  status: 'healthy' | 'degraded' | 'failed';
  
  /** Last execution time */
  lastRunAt?: Date;
  
  /** Last successful collection time */
  lastSuccessAt?: Date;
  
  /** Number of failures in last 24 hours */
  failures24h: number;
  
  /** Average collection duration (ms) */
  averageDurationMs?: number;
  
  /** Current error if failed */
  error?: string;
}

/**
 * Freshness configuration for different telemetry types
 */
export const TELEMETRY_FRESHNESS_TTL = {
  // Network security
  tls: 6 * 60 * 60 * 1000,              // 6 hours
  certificate: 6 * 60 * 60 * 1000,       // 6 hours
  httpsEnforcement: 6 * 60 * 60 * 1000,  // 6 hours
  
  // Platform integrity
  secureBoot: 24 * 60 * 60 * 1000,       // 24 hours
  tpmAttestation: 15 * 60 * 1000,        // 15 minutes
  
  // Key management
  kmsHealth: 60 * 1000,                  // 1 minute
  keyRotation: 12 * 60 * 60 * 1000,      // 12 hours
  secretExpiration: 12 * 60 * 60 * 1000, // 12 hours
  
  // Threat detection
  ransomware: 10 * 1000,                 // 10 seconds
  suspiciousProcess: 30 * 1000,          // 30 seconds
  cameraTamper: 5 * 1000,                // 5 seconds
  
  // Encryption
  recordingEncryption: 6 * 60 * 60 * 1000, // 6 hours
  storageEncryption: 24 * 60 * 60 * 1000,  // 24 hours
  
  // Audit
  auditPipeline: 5 * 60 * 1000,          // 5 minutes
} as const;

/**
 * Calculate freshness score (0-1) based on TTL
 */
export function calculateFreshness(observedAt: Date, ttlMs: number): number {
  const ageMs = Date.now() - observedAt.getTime();
  if (ageMs < 0) return 1.0; // Future timestamp, consider fresh
  if (ageMs > ttlMs) return 0.0; // Expired
  return 1.0 - (ageMs / ttlMs); // Linear decay
}
