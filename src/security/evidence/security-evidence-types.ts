/**
 * Security Evidence Types
 * 
 * Provenance-based security evidence system that makes it impossible
 * to convert missing evidence into "secure" status.
 * 
 * Core principle: missing evidence ≠ healthy, missing evidence = unknown
 */

// ============================================================================
// Core Security States
// ============================================================================

/**
 * Three fundamental security states
 */
export type SecurityState =
  | 'HEALTHY'
  | 'UNHEALTHY'
  | 'UNKNOWN';

/**
 * Source of the evidence
 */
export type EvidenceSourceType =
  | 'LIVE'           // Real-time data from production systems
  | 'SIMULATED'      // Simulated/mock data (NEVER production-trusted)
  | 'UNAVAILABLE';   // Collector not configured or unreachable

/**
 * Machine-readable reasons for security state
 */
export type SecurityReason =
  | 'VERIFIED'                    // Successfully verified healthy
  | 'CONTROL_FAILED'              // Active security control failure
  | 'COLLECTOR_UNAVAILABLE'       // Collector service not running
  | 'NOT_SUPPORTED'               // Platform/device doesn't support this control
  | 'NOT_CONFIGURED'              // Control exists but not configured
  | 'STALE_EVIDENCE'              // Evidence too old to trust
  | 'SIMULATED_DATA'              // Using simulated data (not production-valid)
  | 'PERMISSION_DENIED'           // Insufficient permissions to collect
  | 'TIMEOUT'                     // Collection timed out
  | 'INVALID_RESPONSE'            // Malformed or invalid data received
  | 'NO_EVIDENCE';                // No evidence available

/**
 * Evidence freshness classification
 */
export type FreshnessState =
  | 'FRESH'           // Within acceptable age threshold
  | 'STALE'           // Older than threshold but not expired
  | 'NEVER_OBSERVED'; // Never successfully collected

// ============================================================================
// Discriminated Union Types - Type-Safe Evidence
// ============================================================================

/**
 * Healthy Evidence - MUST have live data and positive verification
 */
export interface HealthyEvidence<T = unknown> {
  state: 'HEALTHY';
  available: true;
  source: 'LIVE';
  confidence: number;         // 0-1, quality of the observation
  observedAt: Date;
  reason: 'VERIFIED';
  evidence: T;                // Actual proof data
}

/**
 * Unhealthy Evidence - MUST have live data showing failure
 */
export interface UnhealthyEvidence<T = unknown> {
  state: 'UNHEALTHY';
  available: true;
  source: 'LIVE';
  confidence: number;
  observedAt: Date;
  reason: 'CONTROL_FAILED';
  evidence: T;                // Proof of the failure
}

/**
 * Unknown Evidence - Missing, unavailable, or untrustworthy data
 */
export interface UnknownEvidence {
  state: 'UNKNOWN';
  available: false;
  source: 'UNAVAILABLE' | 'SIMULATED';
  confidence: number;         // Usually 0 for unknown
  observedAt: Date | null;
  reason: Exclude<SecurityReason, 'VERIFIED' | 'CONTROL_FAILED'>;
  evidence?: never;           // Cannot have evidence for unknown state
}

/**
 * Security Evidence - Discriminated union making invalid states impossible
 */
export type SecurityEvidence<T = unknown> =
  | HealthyEvidence<T>
  | UnhealthyEvidence<T>
  | UnknownEvidence;

// ============================================================================
// Evidence Factory Functions
// ============================================================================

/**
 * Create healthy evidence with live verification
 */
export function healthyEvidence<T>(
  evidence: T,
  observedAt: Date,
  confidence = 1,
): HealthyEvidence<T> {
  return {
    state: 'HEALTHY',
    available: true,
    source: 'LIVE',
    confidence: Math.max(0, Math.min(1, confidence)),
    observedAt,
    reason: 'VERIFIED',
    evidence,
  };
}

/**
 * Create unhealthy evidence with failure proof
 */
export function unhealthyEvidence<T>(
  evidence: T,
  observedAt: Date,
  confidence = 1,
): UnhealthyEvidence<T> {
  return {
    state: 'UNHEALTHY',
    available: true,
    source: 'LIVE',
    confidence: Math.max(0, Math.min(1, confidence)),
    observedAt,
    reason: 'CONTROL_FAILED',
    evidence,
  };
}

/**
 * Create unknown evidence for unavailable/untrusted data
 */
export function unknownEvidence(
  reason: UnknownEvidence['reason'],
  source: UnknownEvidence['source'] = 'UNAVAILABLE',
  observedAt: Date | null = null,
): UnknownEvidence {
  return {
    state: 'UNKNOWN',
    available: false,
    source,
    confidence: 0,
    observedAt,
    reason,
  };
}

// ============================================================================
// Specific Evidence Types
// ============================================================================

/**
 * Secure Boot Evidence
 */
export interface SecureBootEvidenceData {
  deviceId: string;
  attestationId: string;
  secureBootEnabled: boolean;
  quoteVerified: boolean;
  nonceVerified: boolean;
  pcrPolicyVerified: boolean;
  pcrs: Record<number, string>;
  policyId: string;
  attestedAt: Date;
}

/**
 * Ransomware Protection Evidence
 */
export interface RansomwareProtectionEvidenceData {
  agentInstalled: boolean;
  agentConnected: boolean;
  agentVersion: string;
  definitionsCurrent: boolean;
  definitionsVersion: string;
  behaviorMonitoringEnabled: boolean;
  lastScanAt: Date | null;
  lastThreatDetectedAt: Date | null;
  activeThreatCount: number;
  quarantinedThreatCount: number;
}

/**
 * Tamper Protection Evidence
 */
export interface TamperProtectionEvidenceData {
  deviceId: string;
  protectionEnabled: boolean;
  sensorStatus: {
    enclosureSensor: boolean | null;
    motionSensor: boolean | null;
    vibrationSensor: boolean | null;
  };
  lastVerifiedAt: Date;
}

/**
 * Tamper Condition Evidence (actual detected tamper)
 */
export interface TamperConditionEvidenceData {
  deviceId: string;
  enclosureOpened: boolean | null;
  cameraMoved: boolean | null;
  lensObstructed: boolean | null;
  cableDisconnected: boolean | null;
  vibrationDetected: boolean | null;
  detectedAt: Date;
  sensorReadings: Record<string, number>;
}

// ============================================================================
// Collector Interface
// ============================================================================

/**
 * Context for security collection
 */
export interface SecurityCollectionContext {
  tenantId?: string;
  branchId?: string;
  deviceId?: string;
  timestamp: Date;
}

/**
 * Base collector interface - enforces evidence-based responses
 */
export interface SecurityCollector<T> {
  /**
   * Collect security evidence
   * 
   * MUST return SecurityEvidence, NEVER raw booleans or naked success values
   */
  collect(context: SecurityCollectionContext): Promise<SecurityEvidence<T>>;
  
  /**
   * Get collector health status
   */
  getHealth(): Promise<{
    available: boolean;
    lastCollection: Date | null;
    errorCount: number;
    lastError: string | null;
  }>;
}

/**
 * Type-safe collector interfaces for specific controls
 */
export interface SecureBootCollector extends SecurityCollector<SecureBootEvidenceData> {
  collectSecureBootEvidence(
    context: SecurityCollectionContext
  ): Promise<SecurityEvidence<SecureBootEvidenceData>>;
}

export interface RansomwareCollector extends SecurityCollector<RansomwareProtectionEvidenceData> {
  collectRansomwareEvidence(
    context: SecurityCollectionContext
  ): Promise<SecurityEvidence<RansomwareProtectionEvidenceData>>;
}

export interface TamperProtectionCollector extends SecurityCollector<TamperProtectionEvidenceData> {
  collectTamperProtectionEvidence(
    context: SecurityCollectionContext
  ): Promise<SecurityEvidence<TamperProtectionEvidenceData>>;
}

export interface TamperConditionCollector extends SecurityCollector<TamperConditionEvidenceData> {
  collectTamperConditionEvidence(
    context: SecurityCollectionContext
  ): Promise<SecurityEvidence<TamperConditionEvidenceData>>;
}

// ============================================================================
// Freshness Policy
// ============================================================================

/**
 * Maximum age before evidence is considered stale (in milliseconds)
 */
export const FRESHNESS_POLICY = {
  secureBoot: 24 * 60 * 60 * 1000,           // 24 hours
  ransomwareProtection: 5 * 60 * 1000,       // 5 minutes
  tamperProtection: 60 * 1000,               // 1 minute
  tamperCondition: 60 * 1000,                // 1 minute
} as const;

/**
 * Enforce freshness policy on evidence
 */
export function enforceFreshness<T>(
  evidence: SecurityEvidence<T>,
  maxAgeMs: number,
  now = new Date(),
): SecurityEvidence<T> {
  // Unknown or never observed evidence can't go stale
  if (evidence.state === 'UNKNOWN' || evidence.observedAt === null) {
    return evidence;
  }

  const age = now.getTime() - evidence.observedAt.getTime();

  if (age <= maxAgeMs) {
    return evidence;
  }

  // Evidence is stale - downgrade to unknown
  return {
    state: 'UNKNOWN',
    available: false,
    source: 'UNAVAILABLE',
    confidence: 0,
    observedAt: evidence.observedAt, // Preserve original timestamp
    reason: 'STALE_EVIDENCE',
  };
}

/**
 * Validate that simulated evidence never becomes production-trusted
 */
export function evaluateEvidenceSource<T>(
  evidence: SecurityEvidence<T>,
  environment: 'development' | 'test' | 'production',
): SecurityEvidence<T> {
  // In production, simulated data MUST become unknown
  if (environment === 'production' && evidence.source === 'SIMULATED') {
    return {
      state: 'UNKNOWN',
      available: false,
      source: 'SIMULATED',
      confidence: 0,
      observedAt: evidence.observedAt,
      reason: 'SIMULATED_DATA',
    };
  }

  return evidence;
}

// ============================================================================
// Aggregation Logic
// ============================================================================

/**
 * Aggregate multiple security evidence pieces into overall state
 * 
 * Hierarchy: UNHEALTHY > UNKNOWN > HEALTHY
 */
export function aggregateSecurityState(
  controls: SecurityEvidence[],
): SecurityState {
  if (controls.length === 0) {
    return 'UNKNOWN';
  }

  // Any known failure means overall unhealthy
  if (controls.some(control => control.state === 'UNHEALTHY')) {
    return 'UNHEALTHY';
  }

  // Any unknown means we can't say it's healthy
  if (controls.some(control => control.state === 'UNKNOWN')) {
    return 'UNKNOWN';
  }

  // All known healthy
  return 'HEALTHY';
}

/**
 * Calculate evidence coverage (what % of controls have live evidence)
 */
export function calculateEvidenceCoverage(
  controls: SecurityEvidence[],
): number {
  if (controls.length === 0) {
    return 0;
  }

  const liveControls = controls.filter(
    control => control.available && control.source === 'LIVE'
  ).length;

  return liveControls / controls.length;
}

/**
 * Get freshness state for evidence
 */
export function getFreshnessState(
  evidence: SecurityEvidence,
  maxAgeMs: number,
  now = new Date(),
): FreshnessState {
  if (evidence.observedAt === null) {
    return 'NEVER_OBSERVED';
  }

  const age = now.getTime() - evidence.observedAt.getTime();
  
  if (age <= maxAgeMs) {
    return 'FRESH';
  }

  return 'STALE';
}

// ============================================================================
// Posture Summary Types
// ============================================================================

/**
 * Device security posture
 */
export interface DeviceSecurityPosture {
  secureBoot: SecurityEvidence<SecureBootEvidenceData>;
  ransomwareProtection: SecurityEvidence<RansomwareProtectionEvidenceData>;
  tamperProtection: SecurityEvidence<TamperProtectionEvidenceData>;
  tamperCondition: SecurityEvidence<TamperConditionEvidenceData>;
  evaluatedAt: Date;
}

/**
 * Security posture summary
 */
export interface SecurityPostureSummary {
  overallState: SecurityState;
  controlCount: number;
  healthyControls: number;
  unhealthyControls: number;
  unknownControls: number;
  evidenceCoverage: number;  // 0-1
  evaluatedAt: Date;
}

/**
 * Security control definition
 */
export interface SecurityControlDefinition {
  id: string;
  name: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  required: boolean;
  maxEvidenceAgeMs: number;
  description: string;
}

/**
 * Calculate posture summary from controls
 */
export function calculatePostureSummary(
  controls: Record<string, SecurityEvidence>,
  evaluatedAt = new Date(),
): SecurityPostureSummary {
  const evidenceArray = Object.values(controls);
  const overallState = aggregateSecurityState(evidenceArray);
  const controlCount = evidenceArray.length;
  
  const healthyControls = evidenceArray.filter(e => e.state === 'HEALTHY').length;
  const unhealthyControls = evidenceArray.filter(e => e.state === 'UNHEALTHY').length;
  const unknownControls = evidenceArray.filter(e => e.state === 'UNKNOWN').length;
  
  const evidenceCoverage = calculateEvidenceCoverage(evidenceArray);

  return {
    overallState,
    controlCount,
    healthyControls,
    unhealthyControls,
    unknownControls,
    evidenceCoverage,
    evaluatedAt,
  };
}
