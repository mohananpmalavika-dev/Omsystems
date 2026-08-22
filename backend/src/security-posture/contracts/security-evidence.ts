/**
 * Canonical Security Evidence Contract
 * 
 * Defines the universal evidence structure that all security collectors must produce.
 * Evidence is the raw, verifiable security observation before policy evaluation.
 * 
 * Key principle: A security conclusion is only as trustworthy as the evidence 
 * and provenance used to derive it.
 */

/**
 * Evidence health state (before policy evaluation)
 */
export type EvidenceState =
  | 'HEALTHY'      // Evidence indicates secure/compliant state
  | 'UNHEALTHY'    // Evidence indicates insecure/non-compliant state
  | 'UNKNOWN';     // Evidence unavailable or inconclusive

/**
 * Evidence source classification
 */
export type EvidenceSource =
  | 'LIVE'                  // Real-time measurement
  | 'CACHED'                // Previously collected, still valid
  | 'DERIVED'               // Computed from other evidence
  | 'AGENT'                 // Collected by authenticated agent
  | 'DEVICE_API'            // Device self-report via API
  | 'NETWORK_PROBE'         // Active network inspection
  | 'EXTERNAL_SERVICE'      // Third-party service (OCSP, CT log)
  | 'UNAVAILABLE';          // No evidence source available

/**
 * Evidence availability classification
 */
export type EvidenceAvailability =
  | 'AVAILABLE'              // Evidence successfully collected
  | 'TEMPORARILY_UNAVAILABLE' // Source exists but currently unreachable
  | 'UNSUPPORTED'            // Target doesn't support this evidence type
  | 'NOT_CONFIGURED'         // Collector exists but not configured
  | 'PERMISSION_DENIED';     // Insufficient privileges

/**
 * Evidence trust level (for conflict resolution)
 */
export enum EvidenceTrust {
  CRYPTOGRAPHIC_ATTESTATION = 100,  // TPM quote, signed attestation
  DIRECT_LOCAL_INSPECTION = 90,     // Direct OS/filesystem inspection
  AUTHENTICATED_DEVICE_API = 80,    // Verified device API response
  ACTIVE_NETWORK_PROBE = 70,        // Direct network measurement
  SIGNED_AGENT_REPORT = 70,         // Signed agent telemetry
  PASSIVE_OBSERVATION = 50,         // Passive monitoring
  CONFIGURATION_DECLARATION = 30,   // Self-reported configuration
}

/**
 * Collector capability classification
 */
export type CollectorCapability =
  | 'LIVE'        // Production-ready with real evidence
  | 'SIMULATED'   // Test/development implementation
  | 'UNAVAILABLE'; // Not yet implemented

/**
 * Collector execution failure reasons
 */
export enum CollectorFailureReason {
  TIMEOUT = 'TIMEOUT',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  DEVICE_OFFLINE = 'DEVICE_OFFLINE',
  PROVIDER_NOT_CONFIGURED = 'PROVIDER_NOT_CONFIGURED',
  UNSUPPORTED = 'UNSUPPORTED',
  MALFORMED_RESPONSE = 'MALFORMED_RESPONSE',
  CRYPTOGRAPHIC_VERIFICATION_FAILED = 'CRYPTOGRAPHIC_VERIFICATION_FAILED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  STALE_EVIDENCE = 'STALE_EVIDENCE',
  CONFLICTING_EVIDENCE = 'CONFLICTING_EVIDENCE',
}

/**
 * Collector metadata
 */
export interface CollectorMetadata {
  /** Unique collector identifier */
  id: string;
  
  /** Collector version */
  version: string;
  
  /** Collector capability type */
  capability?: CollectorCapability;
}

/**
 * Security target identification
 */
export interface SecurityTarget {
  /** Tenant identifier */
  tenantId: string;
  
  /** Branch/site identifier */
  branchId?: string;
  
  /** Device identifier */
  deviceId?: string;
  
  /** Server/host identifier */
  serverId?: string;
  
  /** Network segment identifier */
  networkId?: string;
  
  /** Entity type for classification */
  entityType?: 'camera' | 'nvr' | 'server' | 'edge-agent' | 'network';
}

/**
 * Evidence provenance (how evidence was obtained)
 */
export interface EvidenceProvenance {
  /** API endpoint or service URL */
  endpoint?: string;
  
  /** Network protocol used */
  protocol?: string;
  
  /** Agent identifier if agent-collected */
  agentId?: string;
  
  /** TLS certificate fingerprint */
  certificateFingerprint?: string;
  
  /** Evidence trust classification */
  trustLevel?: EvidenceTrust;
  
  /** Cryptographic signature (for attestation) */
  signature?: string;
  
  /** Nonce used (for replay protection) */
  nonce?: string;
}

/**
 * Canonical Security Evidence
 * 
 * This is the universal contract that ALL security collectors must return.
 * No collector may return arbitrary objects or custom formats.
 */
export interface SecurityEvidence<T = unknown> {
  /** Evidence health state */
  state: EvidenceState;
  
  /** Is evidence available? */
  available: boolean;
  
  /** Detailed availability status */
  availability: EvidenceAvailability;
  
  /** Evidence source classification */
  source: EvidenceSource;
  
  /** Confidence in this evidence (0-1) */
  confidence: number;
  
  /** When evidence was observed by source */
  observedAt: Date | null;
  
  /** When evidence expires (optional) */
  expiresAt?: Date | null;
  
  /** Typed evidence payload */
  value?: T;
  
  /** Human-readable reason for state */
  reason?: string;
  
  /** Collector that produced this evidence */
  collector: CollectorMetadata;
  
  /** Target this evidence applies to */
  target: SecurityTarget;
  
  /** Evidence provenance */
  provenance?: EvidenceProvenance;
  
  /** Failure reason if unavailable */
  failureReason?: CollectorFailureReason;
  
  /** Additional metadata for investigation */
  metadata?: Record<string, unknown>;
}

/**
 * Evidence with compliance evaluation
 * 
 * Separates raw evidence state from policy compliance decision.
 */
export interface SecurityControlResult<T = unknown> {
  /** Raw evidence */
  evidence: SecurityEvidence<T>;
  
  /** Evidence state (raw observation) */
  evidenceState: EvidenceState;
  
  /** Compliance state (policy evaluation) */
  complianceState: 'COMPLIANT' | 'NON_COMPLIANT' | 'INDETERMINATE';
  
  /** Policy rule that was evaluated */
  policyRule?: string;
  
  /** Compliance reason */
  complianceReason?: string;
}

/**
 * Evidence observation with timestamp (for persistence)
 */
export interface EvidenceObservation<T = unknown> {
  /** Unique observation ID */
  id: string;
  
  /** Evidence */
  evidence: SecurityEvidence<T>;
  
  /** When observation was recorded */
  recordedAt: Date;
  
  /** Observation sequence number */
  sequence?: number;
}

/**
 * Helper: Create unavailable evidence
 */
export function createUnavailableEvidence<T = unknown>(
  collector: CollectorMetadata,
  target: SecurityTarget,
  availability: EvidenceAvailability,
  reason: string,
  failureReason?: CollectorFailureReason
): SecurityEvidence<T> {
  return {
    state: 'UNKNOWN',
    available: false,
    availability,
    source: 'UNAVAILABLE',
    confidence: 0,
    observedAt: null,
    reason,
    collector,
    target,
    failureReason,
  };
}

/**
 * Helper: Create healthy evidence
 */
export function createHealthyEvidence<T>(
  collector: CollectorMetadata,
  target: SecurityTarget,
  value: T,
  observedAt: Date,
  options: {
    source: EvidenceSource;
    confidence?: number;
    expiresAt?: Date;
    provenance?: EvidenceProvenance;
    metadata?: Record<string, unknown>;
  }
): SecurityEvidence<T> {
  return {
    state: 'HEALTHY',
    available: true,
    availability: 'AVAILABLE',
    source: options.source,
    confidence: options.confidence ?? 1.0,
    observedAt,
    expiresAt: options.expiresAt,
    value,
    collector,
    target,
    provenance: options.provenance,
    metadata: options.metadata,
  };
}

/**
 * Helper: Create unhealthy evidence
 */
export function createUnhealthyEvidence<T>(
  collector: CollectorMetadata,
  target: SecurityTarget,
  value: T,
  observedAt: Date,
  reason: string,
  options: {
    source: EvidenceSource;
    confidence?: number;
    provenance?: EvidenceProvenance;
    metadata?: Record<string, unknown>;
  }
): SecurityEvidence<T> {
  return {
    state: 'UNHEALTHY',
    available: true,
    availability: 'AVAILABLE',
    source: options.source,
    confidence: options.confidence ?? 1.0,
    observedAt,
    value,
    reason,
    collector,
    target,
    provenance: options.provenance,
    metadata: options.metadata,
  };
}

/**
 * Helper: Create unknown evidence (when measurement fails)
 */
export function createUnknownEvidence<T = unknown>(
  collector: CollectorMetadata,
  target: SecurityTarget,
  reason: string,
  failureReason: CollectorFailureReason
): SecurityEvidence<T> {
  return {
    state: 'UNKNOWN',
    available: false,
    availability: 'TEMPORARILY_UNAVAILABLE',
    source: 'UNAVAILABLE',
    confidence: 0,
    observedAt: new Date(),
    reason,
    collector,
    target,
    failureReason,
  };
}

/**
 * Helper: Check if evidence is stale
 */
export function isEvidenceStale(
  evidence: SecurityEvidence,
  maxAgeMs: number
): boolean {
  if (!evidence.observedAt) return true;
  
  const ageMs = Date.now() - evidence.observedAt.getTime();
  return ageMs > maxAgeMs;
}

/**
 * Helper: Check if evidence is expired
 */
export function isEvidenceExpired(evidence: SecurityEvidence): boolean {
  if (!evidence.expiresAt) return false;
  return evidence.expiresAt.getTime() < Date.now();
}

/**
 * Helper: Calculate evidence freshness (0-1)
 */
export function calculateEvidenceFreshness(
  evidence: SecurityEvidence,
  ttlMs: number
): number {
  if (!evidence.observedAt) return 0;
  if (isEvidenceExpired(evidence)) return 0;
  
  const ageMs = Date.now() - evidence.observedAt.getTime();
  if (ageMs < 0) return 1.0; // Future timestamp
  if (ageMs > ttlMs) return 0.0; // Beyond TTL
  
  return 1.0 - (ageMs / ttlMs); // Linear decay
}
