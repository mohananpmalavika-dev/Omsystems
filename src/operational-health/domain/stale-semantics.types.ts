/**
 * Stale-Data Semantics & Health Freshness Domain Types
 * 
 * Enforces enterprise-wide freshness invariants across all device telemetry:
 * - No entity may be presented as HEALTHY without fresh supporting evidence.
 * - Distinguishes between Observed Health (evidence) and Effective Health (evaluated state).
 * - Distinguishes between STALE (untrustworthy evidence) and UNKNOWN (unverifiable state).
 * - Integrates with Digital Twin dependency topology for root-cause overrides.
 */

export type EntityType =
  | "BRANCH"
  | "INTERNET"
  | "EDGE_GATEWAY"
  | "ROUTER"
  | "SWITCH"
  | "RECORDER"
  | "CAMERA"
  | "DISK"
  | "RECORDING"
  | "NTP"
  | "VPN";

export type ObservedHealth = "HEALTHY" | "WARNING" | "CRITICAL";

export type EffectiveHealthState = "HEALTHY" | "WARNING" | "CRITICAL" | "UNKNOWN";

export type FreshnessState = "FRESH" | "AGING" | "STALE" | "NEVER_OBSERVED";

export type HealthReasonCode =
  | "NO_OBSERVATION"
  | "OBSERVATION_EXPIRED"
  | "EDGE_GATEWAY_OFFLINE"
  | "BRANCH_OFFLINE"
  | "INTERNET_OFFLINE"
  | "UPSTREAM_DEPENDENCY_UNAVAILABLE"
  | "RECORDER_UNREACHABLE"
  | "COLLECTOR_ERROR"
  | "AUTHENTICATION_FAILED"
  | "CAPABILITY_UNSUPPORTED"
  | "POLL_TIMEOUT"
  | "CLOCK_DRIFT_EXCESSIVE";

export const HEALTH_REASON_LABELS: Record<HealthReasonCode, string> = {
  NO_OBSERVATION: "No health observation has been received",
  OBSERVATION_EXPIRED: "Latest health observation has exceeded freshness TTL",
  EDGE_GATEWAY_OFFLINE: "Branch Edge Gateway is offline",
  BRANCH_OFFLINE: "Branch network connectivity is unavailable",
  INTERNET_OFFLINE: "Branch Internet/WAN link is offline",
  UPSTREAM_DEPENDENCY_UNAVAILABLE: "Upstream infrastructure dependency is offline",
  RECORDER_UNREACHABLE: "Device status cannot be verified because its recorder is unreachable",
  COLLECTOR_ERROR: "Telemetry collector encountered an unhandled error",
  AUTHENTICATION_FAILED: "Device authentication or credential verification failed",
  CAPABILITY_UNSUPPORTED: "Device does not support requested telemetry probe",
  POLL_TIMEOUT: "Device polling timed out",
  CLOCK_DRIFT_EXCESSIVE: "Excessive clock drift detected between edge and central control plane",
};

export interface HealthObservation<T = unknown> {
  id?: string;
  tenantId?: string;
  branchId?: string;
  entityId: string;
  entityType: EntityType;
  health: ObservedHealth;
  observedAt: Date | string;
  receivedAt?: Date | string;
  expiresAt?: Date | string;
  source: string;
  data?: T;
  reason?: string;
  reasonCode?: HealthReasonCode;
  metadata?: Record<string, unknown>;
}

export interface FreshnessPolicy {
  entityType: EntityType;
  expectedIntervalSeconds: number;
  warningAfterSeconds: number;
  staleAfterSeconds: number;
  unknownAfterSeconds?: number;
}

export interface OperationalHealth<T = unknown> {
  entityId: string;
  entityType: EntityType;
  branchId?: string;
  state: EffectiveHealthState;
  freshness: FreshnessState;
  observedStatus?: ObservedHealth;
  observedAt?: string;
  receivedAt?: string;
  expiresAt?: string;
  ageSeconds: number;
  staleForSeconds?: number;
  source?: string;
  confidence?: number;
  reasonCode?: HealthReasonCode;
  reason?: string;
  lastKnownState?: ObservedHealth;
  value?: T;
}

export interface BranchTelemetrySummary {
  branchId: string;
  branchName?: string;
  branchStatus: EffectiveHealthState;
  monitoringVisibility: "FULL" | "DEGRADED" | "UNAVAILABLE";
  rootCause?: {
    entityId: string;
    entityType: EntityType;
    status: EffectiveHealthState;
    reasonCode: HealthReasonCode;
    reason: string;
    detectedAt: string;
  };
  metrics: {
    totalEntities: number;
    healthyCount: number;
    warningCount: number;
    criticalCount: number;
    unknownCount: number;
    staleCount: number;
    freshCount: number;
  };
  entities: OperationalHealth[];
  generatedAt: string;
}

export interface TelemetryQualityReport {
  totalMonitoredBranches: number;
  branchesWithStaleTelemetryCount: number;
  staleTelemetryPercentage: number;
  entitiesUnknownCount: {
    recorders: number;
    cameras: number;
    disks: number;
    network: number;
    total: number;
  };
  oldestUnresolvedTelemetryGapMinutes: number;
  telemetryGaps: Array<{
    branchId: string;
    entityId: string;
    entityType: EntityType;
    lastVerifiedAt: string;
    ageMinutes: number;
    reasonCode: HealthReasonCode;
    reason: string;
  }>;
  generatedAt: string;
}
