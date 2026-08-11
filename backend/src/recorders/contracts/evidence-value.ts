/**
 * Evidence Value System
 * 
 * Core contracts for fact-based recorder observation.
 * 
 * CRITICAL ARCHITECTURAL PRINCIPLES:
 * 
 * 1. Evidence vs Assessment
 *    - Evidence = what was observed
 *    - Assessment = interpretation/policy decision
 *    - Never conflate them
 * 
 * 2. Unknown ≠ False
 *    - OBSERVED(false) means "verified not present"
 *    - UNKNOWN means "could not verify"
 *    - Never convert UNKNOWN to false
 * 
 * 3. State Semantics
 *    - OBSERVED: value was successfully observed
 *    - UNKNOWN: observation failed for unclassified reason
 *    - UNSUPPORTED: device/adapter does not implement capability
 *    - AUTH_FAILED: authentication prevented observation
 *    - TIMEOUT: observation exceeded time limit
 *    - UNREACHABLE: device/network unreachable
 *    - MALFORMED_RESPONSE: received invalid/unparseable response
 *    - RATE_LIMITED: temporarily throttled
 *    - DEVICE_ERROR: recorder reported internal error
 * 
 * 4. Confidence
 *    - 1.0 = directly verified
 *    - 0.7-0.9 = inferred from indirect signals
 *    - 0.5-0.6 = weak inference
 *    - 0.0 = no information
 */

/**
 * Evidence state taxonomy
 */
export type EvidenceState =
  | 'OBSERVED'           // Value successfully observed
  | 'UNKNOWN'            // Could not observe (unspecified reason)
  | 'UNSUPPORTED'        // Capability not supported by device/adapter
  | 'AUTH_FAILED'        // Authentication prevented observation
  | 'TIMEOUT'            // Observation timed out
  | 'UNREACHABLE'        // Device/network unreachable
  | 'MALFORMED_RESPONSE' // Response was unparseable
  | 'RATE_LIMITED'       // Temporarily throttled
  | 'DEVICE_ERROR';      // Recorder reported internal error

/**
 * Universal evidence wrapper
 * 
 * Preserves:
 * - What was observed (value)
 * - How we know it (source)
 * - When we learned it (observedAt)
 * - Whether it's reliable (confidence)
 * - Why it's unavailable (error)
 */
export interface EvidenceValue<T> {
  /**
   * Evidence state
   */
  state: EvidenceState;

  /**
   * Observed value (only present when state=OBSERVED)
   */
  value?: T;

  /**
   * When observation occurred
   */
  observedAt: Date;

  /**
   * Where evidence came from
   */
  source: EvidenceSource;

  /**
   * Confidence level (0-1)
   * 
   * 1.0 = directly verified
   * 0.7-0.9 = inferred from indirect signals
   * 0.5-0.6 = weak inference
   * 0.0 = no information
   */
  confidence: number;

  /**
   * Observation latency in milliseconds
   */
  latencyMs?: number;

  /**
   * Error details (when state != OBSERVED)
   */
  error?: EvidenceError;

  /**
   * Optional reference to raw response
   * (sanitized, for debugging)
   */
  rawReference?: string;
}

/**
 * Evidence source tracking
 */
export interface EvidenceSource {
  /**
   * Adapter type that produced evidence
   */
  adapter: RecorderAdapterType;

  /**
   * Operation/method that produced evidence
   */
  operation: string;

  /**
   * Endpoint/URL queried (optional, sanitized)
   */
  endpoint?: string;

  /**
   * Protocol used
   */
  protocol?: 'http' | 'https' | 'rtsp' | 'soap';
}

/**
 * Supported adapter types
 */
export type RecorderAdapterType =
  | 'onvif'
  | 'hikvision'
  | 'dahua'
  | 'generic_rtsp'
  | 'axis'
  | 'uniview'
  | 'unknown';

/**
 * Evidence error details
 */
export interface EvidenceError {
  /**
   * Normalized error code
   */
  code: RecorderErrorCode;

  /**
   * Human-readable error message
   */
  message: string;

  /**
   * Vendor-specific error code (if available)
   */
  vendorCode?: string;

  /**
   * HTTP status code (if applicable)
   */
  httpStatus?: number;

  /**
   * Additional context
   */
  context?: Record<string, any>;
}

/**
 * Normalized error taxonomy
 * 
 * Maps all transport, protocol, and device failures
 * to consistent codes.
 */
export type RecorderErrorCode =
  // Network layer
  | 'NETWORK_UNREACHABLE'
  | 'CONNECTION_REFUSED'
  | 'DNS_FAILURE'
  | 'TIMEOUT'
  | 'TLS_ERROR'
  | 'CERTIFICATE_ERROR'

  // Authentication layer
  | 'AUTH_REQUIRED'
  | 'AUTH_FAILED'
  | 'FORBIDDEN'
  | 'SESSION_EXPIRED'

  // Protocol layer
  | 'NOT_FOUND'
  | 'UNSUPPORTED_FEATURE'
  | 'INVALID_REQUEST'
  | 'MALFORMED_RESPONSE'
  | 'PROTOCOL_ERROR'

  // Device layer
  | 'DEVICE_BUSY'
  | 'DEVICE_ERROR'
  | 'RESOURCE_UNAVAILABLE'
  | 'VENDOR_ERROR'

  // Rate limiting
  | 'RATE_LIMITED'
  | 'TOO_MANY_REQUESTS'

  // Generic
  | 'UNKNOWN_ERROR';

/**
 * Freshness classification
 * 
 * Used to evaluate whether evidence is current enough
 * for decision-making.
 */
export type EvidenceFreshness =
  | 'FRESH'    // Within acceptable age
  | 'STALE'    // Beyond ideal age but usable
  | 'EXPIRED'; // Too old for reliable use

/**
 * Evidence freshness thresholds (milliseconds)
 */
export interface FreshnessThresholds {
  /**
   * Maximum age for FRESH classification
   */
  freshMs: number;

  /**
   * Maximum age for STALE classification
   * (beyond this = EXPIRED)
   */
  staleMs: number;
}

/**
 * Default freshness thresholds by evidence type
 */
export const DEFAULT_FRESHNESS_THRESHOLDS: Record<string, FreshnessThresholds> = {
  // Fast-changing state
  'streamStatus': {
    freshMs: 30_000,      // 30 seconds
    staleMs: 120_000      // 2 minutes
  },
  'recordingStatus': {
    freshMs: 60_000,      // 1 minute
    staleMs: 300_000      // 5 minutes
  },

  // Moderate change frequency
  'deviceInfo': {
    freshMs: 3600_000,    // 1 hour
    staleMs: 86400_000    // 24 hours
  },
  'storage': {
    freshMs: 300_000,     // 5 minutes
    staleMs: 1800_000     // 30 minutes
  },

  // Slow-changing state
  'channels': {
    freshMs: 3600_000,    // 1 hour
    staleMs: 86400_000    // 24 hours
  },
  'capabilities': {
    freshMs: 86400_000,   // 24 hours
    staleMs: 604800_000   // 7 days
  },

  // Archive evidence
  'archiveSearch': {
    freshMs: 120_000,     // 2 minutes
    staleMs: 600_000      // 10 minutes
  }
};

/**
 * Calculate evidence freshness
 */
export function calculateFreshness(
  observedAt: Date,
  now: Date,
  thresholds: FreshnessThresholds
): EvidenceFreshness {
  const ageMs = now.getTime() - observedAt.getTime();

  if (ageMs <= thresholds.freshMs) {
    return 'FRESH';
  }

  if (ageMs <= thresholds.staleMs) {
    return 'STALE';
  }

  return 'EXPIRED';
}

/**
 * Type guard for observed evidence
 */
export function isObserved<T>(evidence: EvidenceValue<T>): evidence is EvidenceValue<T> & { value: T } {
  return evidence.state === 'OBSERVED' && evidence.value !== undefined;
}

/**
 * Type guard for failed evidence
 */
export function isFailed<T>(evidence: EvidenceValue<T>): boolean {
  return evidence.state !== 'OBSERVED';
}

/**
 * Check if error is retriable
 */
export function isRetriableError(code: RecorderErrorCode): boolean {
  const retriable: RecorderErrorCode[] = [
    'TIMEOUT',
    'NETWORK_UNREACHABLE',
    'CONNECTION_REFUSED',
    'DEVICE_BUSY',
    'RATE_LIMITED',
    'TOO_MANY_REQUESTS',
    'SESSION_EXPIRED'
  ];

  return retriable.includes(code);
}

/**
 * Map evidence state to error code
 */
export function stateToErrorCode(state: EvidenceState): RecorderErrorCode | null {
  const mapping: Partial<Record<EvidenceState, RecorderErrorCode>> = {
    'AUTH_FAILED': 'AUTH_FAILED',
    'TIMEOUT': 'TIMEOUT',
    'UNREACHABLE': 'NETWORK_UNREACHABLE',
    'MALFORMED_RESPONSE': 'MALFORMED_RESPONSE',
    'RATE_LIMITED': 'RATE_LIMITED',
    'DEVICE_ERROR': 'DEVICE_ERROR',
    'UNSUPPORTED': 'UNSUPPORTED_FEATURE',
    'UNKNOWN': 'UNKNOWN_ERROR'
  };

  return mapping[state] ?? null;
}
