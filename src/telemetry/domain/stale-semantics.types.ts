/**
 * Canonical Stale Data & Observation TTL Domain Contracts
 * 
 * Enforces that every health observation has observedAt, expiresAt, and TTL.
 * Prevents Head Office dashboards from displaying green checkmarks indefinitely
 * when branch WAN connectivity is lost.
 */

export type FreshnessStatus = "FRESH" | "STALE" | "EXPIRED";

export interface StaleObservationMetadata {
  observedAt: Date;
  expiresAt: Date;
  ttlSeconds: number;
  isStale: boolean;
  freshnessStatus: FreshnessStatus;
  originalState: string;
  effectiveState: string;
  stalenessReason?: string | undefined;
  lastObservedAgoSeconds: number;
}

export interface FreshnessWrapper<T> {
  data: T;
  metadata: StaleObservationMetadata;
}

export const DEFAULT_OBSERVATION_TTLS = {
  INTERNET_HEALTH_TTL_SECONDS: 45,
  RECORDER_HEALTH_TTL_SECONDS: 60,
  CAMERA_HEALTH_TTL_SECONDS: 60,
  STORAGE_HEALTH_TTL_SECONDS: 1800, // 30 minutes
  EDGE_AGENT_TTL_SECONDS: 60,
  BRANCH_STATE_TTL_SECONDS: 60,
} as const;
