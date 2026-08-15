/**
 * Universal Evidence Type System
 * 
 * Standardized evidence contract for all surveillance platform integrations.
 * 
 * Core Principle:
 * Never invent healthy values. Always distinguish between:
 * - VERIFIED: Positive evidence collected and validated
 * - FAILED: Evidence collection attempted, failure confirmed
 * - UNKNOWN: Cannot collect evidence (infrastructure unavailable)
 * - UNSUPPORTED: Device/feature doesn't support this capability
 * 
 * Every integration should return Evidence<T> instead of raw values.
 */

/**
 * Evidence state
 */
export type EvidenceState = 
  | 'VERIFIED'      // Positive evidence collected and validated
  | 'FAILED'        // Evidence collection attempted, failure confirmed
  | 'UNKNOWN'       // Cannot collect evidence (infrastructure unavailable)
  | 'UNSUPPORTED';  // Device/feature doesn't support this capability

/**
 * Evidence source
 */
export type EvidenceSource = 
  | 'LIVE'          // Real-time data from device/service
  | 'SIMULATED'     // Simulated/synthetic data (dev/test only)
  | 'UNAVAILABLE';  // Data source not available

/**
 * Universal evidence container
 * 
 * @template T - The type of the evidence value
 */
export interface Evidence<T> {
  /**
   * The evidence value (null if unavailable)
   */
  value: T | null;
  
  /**
   * Evidence state
   * 
   * VERIFIED: Evidence was collected and validated successfully
   * FAILED: Evidence collection was attempted but failed
   * UNKNOWN: Cannot determine state (infrastructure unavailable)
   * UNSUPPORTED: Device/feature doesn't support this evidence type
   */
  state: EvidenceState;
  
  /**
   * Whether evidence collection infrastructure is available
   * 
   * false = collector not configured/installed
   * true = collector available (may still fail to collect)
   */
  available: boolean;
  
  /**
   * Evidence source
   * 
   * LIVE: Real-time data from actual device/service
   * SIMULATED: Synthetic data (only in dev/test environments)
   * UNAVAILABLE: Data source not reachable
   */
  source: EvidenceSource;
  
  /**
   * Confidence level (0-1)
   * 
   * 0 = No confidence
   * 1 = Complete confidence
   * 
   * Use for probabilistic evidence (e.g., ML inference, heuristics)
   */
  confidence: number;
  
  /**
   * When the evidence was observed/collected
   * null if evidence was never collected
   */
  observedAt: Date | null;
  
  /**
   * Human-readable reason for current state
   * Especially important for FAILED and UNKNOWN states
   */
  reason?: string;
  
  /**
   * Additional metadata about evidence collection
   * Use for diagnostic information, collection method details, etc.
   */
  metadata?: Record<string, any>;
}

/**
 * Evidence with provenance tracking
 * Extends Evidence with full audit trail
 */
export interface ProvenanceEvidence<T> extends Evidence<T> {
  /**
   * Unique evidence collection ID
   */
  collectionId: string;
  
  /**
   * Collector/service that provided this evidence
   */
  collectorId: string;
  
  /**
   * Collection method/protocol used
   */
  collectionMethod?: string;
  
  /**
   * Previous observation (for change tracking)
   */
  previousValue?: T | null;
  
  /**
   * Previous observation time
   */
  previousObservedAt?: Date | null;
}

/**
 * Helper: Create VERIFIED evidence
 */
export function verified<T>(
  value: T,
  options?: {
    confidence?: number;
    source?: EvidenceSource;
    observedAt?: Date;
    reason?: string;
    metadata?: Record<string, any>;
  }
): Evidence<T> {
  return {
    value,
    state: 'VERIFIED',
    available: true,
    source: options?.source ?? 'LIVE',
    confidence: options?.confidence ?? 1.0,
    observedAt: options?.observedAt ?? new Date(),
    reason: options?.reason,
    metadata: options?.metadata,
  };
}

/**
 * Helper: Create FAILED evidence
 */
export function failed<T>(
  reason: string,
  options?: {
    confidence?: number;
    source?: EvidenceSource;
    observedAt?: Date;
    metadata?: Record<string, any>;
  }
): Evidence<T> {
  return {
    value: null,
    state: 'FAILED',
    available: true,
    source: options?.source ?? 'LIVE',
    confidence: options?.confidence ?? 0,
    observedAt: options?.observedAt ?? new Date(),
    reason,
    metadata: options?.metadata,
  };
}

/**
 * Helper: Create UNKNOWN evidence
 */
export function unknown<T>(
  reason: string,
  options?: {
    available?: boolean;
    metadata?: Record<string, any>;
  }
): Evidence<T> {
  return {
    value: null,
    state: 'UNKNOWN',
    available: options?.available ?? false,
    source: 'UNAVAILABLE',
    confidence: 0,
    observedAt: null,
    reason,
    metadata: options?.metadata,
  };
}

/**
 * Helper: Create UNSUPPORTED evidence
 */
export function unsupported<T>(
  reason: string,
  options?: {
    metadata?: Record<string, any>;
  }
): Evidence<T> {
  return {
    value: null,
    state: 'UNSUPPORTED',
    available: false,
    source: 'UNAVAILABLE',
    confidence: 0,
    observedAt: null,
    reason,
    metadata: options?.metadata,
  };
}

/**
 * Helper: Create SIMULATED evidence (dev/test only)
 */
export function simulated<T>(
  value: T,
  options?: {
    confidence?: number;
    observedAt?: Date;
    reason?: string;
    metadata?: Record<string, any>;
  }
): Evidence<T> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SIMULATED evidence is not allowed in production environments. ' +
      'Use verified(), failed(), unknown(), or unsupported() instead.'
    );
  }
  
  return {
    value,
    state: 'VERIFIED',
    available: true,
    source: 'SIMULATED',
    confidence: options?.confidence ?? 0.5,
    observedAt: options?.observedAt ?? new Date(),
    reason: options?.reason ?? 'Simulated for development/testing',
    metadata: {
      ...options?.metadata,
      simulated: true,
      environment: process.env.NODE_ENV,
    },
  };
}

/**
 * Check if evidence is verified
 */
export function isVerified<T>(evidence: Evidence<T>): evidence is Evidence<T> & { value: T } {
  return evidence.state === 'VERIFIED' && evidence.value !== null;
}

/**
 * Check if evidence is from live source
 */
export function isLive<T>(evidence: Evidence<T>): boolean {
  return evidence.source === 'LIVE';
}

/**
 * Check if evidence is simulated
 */
export function isSimulated<T>(evidence: Evidence<T>): boolean {
  return evidence.source === 'SIMULATED';
}

/**
 * Get evidence age in milliseconds
 */
export function getEvidenceAge(evidence: Evidence<any>): number | null {
  if (!evidence.observedAt) return null;
  return Date.now() - evidence.observedAt.getTime();
}

/**
 * Check if evidence is stale (older than threshold)
 */
export function isStale(evidence: Evidence<any>, maxAgeMs: number): boolean {
  const age = getEvidenceAge(evidence);
  return age !== null && age > maxAgeMs;
}

/**
 * Combine multiple evidence values into aggregate
 * Returns VERIFIED only if ALL evidence is verified
 */
export function combineEvidence<T>(
  evidences: Evidence<T>[],
  combinator: (values: T[]) => T
): Evidence<T> {
  if (evidences.length === 0) {
    return unknown('No evidence provided');
  }
  
  // Check if any evidence is unavailable
  if (evidences.some(e => !e.available)) {
    return unknown('Some evidence sources unavailable');
  }
  
  // Check if any evidence is unsupported
  if (evidences.some(e => e.state === 'UNSUPPORTED')) {
    return unsupported('Some evidence sources unsupported');
  }
  
  // Check if any evidence failed
  const failedEvidence = evidences.find(e => e.state === 'FAILED');
  if (failedEvidence) {
    return failed(failedEvidence.reason || 'Evidence collection failed');
  }
  
  // Check if any evidence is unknown
  const unknownEvidence = evidences.find(e => e.state === 'UNKNOWN');
  if (unknownEvidence) {
    return unknown(unknownEvidence.reason || 'Evidence state unknown');
  }
  
  // All evidence is verified - combine values
  const values = evidences.map(e => e.value).filter((v): v is T => v !== null);
  if (values.length !== evidences.length) {
    return failed('Some evidence values are null despite VERIFIED state');
  }
  
  const combinedValue = combinator(values);
  const minConfidence = Math.min(...evidences.map(e => e.confidence));
  const latestObservedAt = evidences
    .map(e => e.observedAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  
  return verified(combinedValue, {
    confidence: minConfidence,
    observedAt: latestObservedAt ?? undefined,
    source: evidences.every(e => e.source === 'LIVE') ? 'LIVE' : 'SIMULATED',
    reason: 'Combined from multiple evidence sources',
    metadata: {
      sourceCount: evidences.length,
      sources: evidences.map(e => e.metadata?.collectorId).filter(Boolean),
    },
  });
}

// ============================================================================
// Domain-Specific Evidence Types
// ============================================================================

/**
 * Recording evidence
 */
export interface RecordingEvidence {
  codec: string;
  resolution: {
    width: number;
    height: number;
  };
  fps: number;
  durationSeconds: number;
  frameCount?: number;
  packetCount?: number;
  sizeBytes?: number;
  bitrateKbps?: number;
}

export type RecordingEvidenceResult = Evidence<RecordingEvidence>;

/**
 * TPM attestation evidence
 */
export interface TPMAttestationEvidence {
  quoteValid: boolean;
  pcrValues: Record<string, string>;
  attestationKeyValid: boolean;
  nonceMatched: boolean;
  signatureValid: boolean;
  tpmVersion?: string;
  firmwareVersion?: string;
}

export type TPMAttestationResult = Evidence<TPMAttestationEvidence>;

/**
 * Camera health evidence
 */
export interface CameraHealthEvidence {
  online: boolean;
  reachable: boolean;
  responseTimeMs: number;
  temperature?: number;
  bitrate?: number;
  frameRate?: number;
  resolution?: { width: number; height: number };
  errors?: string[];
}

export type CameraHealthResult = Evidence<CameraHealthEvidence>;

/**
 * Storage health evidence
 */
export interface StorageHealthEvidence {
  device: string;
  model: string;
  serialNumber: string;
  temperature: number;
  reallocatedSectors: number;
  pendingSectors: number;
  powerOnHours: number;
  smartStatus: 'PASSED' | 'FAILED' | 'UNKNOWN';
  raidState?: 'HEALTHY' | 'DEGRADED' | 'FAILED';
}

export type StorageHealthResult = Evidence<StorageHealthEvidence>;

/**
 * Network health evidence
 */
export interface NetworkHealthEvidence {
  latencyMs: number;
  jitterMs: number;
  packetLossPercent: number;
  bandwidth: {
    uploadMbps: number;
    downloadMbps: number;
  };
  interfaceStatus: 'UP' | 'DOWN';
}

export type NetworkHealthResult = Evidence<NetworkHealthEvidence>;

/**
 * Certificate evidence
 */
export interface CertificateEvidence {
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  daysUntilExpiry: number;
  serialNumber: string;
  algorithm: string;
  keyLength: number;
  signatureValid: boolean;
  chainValid: boolean;
  revoked: boolean;
}

export type CertificateResult = Evidence<CertificateEvidence>;

/**
 * Secure boot evidence
 */
export interface SecureBootEvidence {
  enabled: boolean;
  uefiMode: boolean;
  bootIntegrityVerified: boolean;
  secureBootVariables: {
    platformKey?: string;
    keyExchangeKeys?: string[];
    authorizedDb?: string[];
    forbiddenDbx?: string[];
  };
}

export type SecureBootResult = Evidence<SecureBootEvidence>;

/**
 * Ransomware protection evidence
 */
export interface RansomwareProtectionEvidence {
  agentRunning: boolean;
  realTimeProtectionEnabled: boolean;
  definitionsUpToDate: boolean;
  definitionsVersion?: string;
  lastScanTime?: Date;
  threatsDetected: number;
  threatsBlocked: number;
}

export type RansomwareProtectionResult = Evidence<RansomwareProtectionEvidence>;

// ============================================================================
// Exports
// ============================================================================

export type {
  Evidence,
  ProvenanceEvidence,
  EvidenceState,
  EvidenceSource,
};

export {
  verified,
  failed,
  unknown,
  unsupported,
  simulated,
  isVerified,
  isLive,
  isSimulated,
  getEvidenceAge,
  isStale,
  combineEvidence,
};
