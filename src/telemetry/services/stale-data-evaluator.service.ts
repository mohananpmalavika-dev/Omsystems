/**
 * Stale Data Evaluator Service
 * 
 * Enforces strict TTL expiration across all branch telemetry and device health observations.
 * When TTL is exceeded, original "HEALTHY" status is automatically downgraded to "STALE" or "UNKNOWN"
 * with explicit explainable reason codes (e.g., "BRANCH_OFFLINE", "TELEMETRY_TTL_EXPIRED").
 */

import {
  StaleObservationMetadata,
  FreshnessWrapper,
  FreshnessStatus,
  DEFAULT_OBSERVATION_TTLS,
} from "../domain/stale-semantics.types.js";

export class StaleDataEvaluatorService {
  /**
   * Evaluate freshness metadata for any timestamped observation
   */
  evaluateMetadata(
    observedAt: Date | string,
    originalState: string,
    ttlSeconds: number = DEFAULT_OBSERVATION_TTLS.CAMERA_HEALTH_TTL_SECONDS,
    currentTime: Date = new Date(),
    overrideReason?: string
  ): StaleObservationMetadata {
    const obsDate = typeof observedAt === "string" ? new Date(observedAt) : observedAt;
    const expiresAt = new Date(obsDate.getTime() + ttlSeconds * 1000);
    const elapsedSeconds = Math.max(0, Math.floor((currentTime.getTime() - obsDate.getTime()) / 1000));
    const isStale = currentTime.getTime() > expiresAt.getTime();

    let freshnessStatus: FreshnessStatus = "FRESH";
    let effectiveState = originalState;
    let stalenessReason: string | undefined = undefined;

    if (isStale) {
      freshnessStatus = elapsedSeconds >= ttlSeconds * 2 ? "EXPIRED" : "STALE";
      // Downgrade state if it was claiming to be healthy
      if (originalState === "HEALTHY" || originalState === "ONLINE" || originalState === "PASSED") {
        effectiveState = "UNKNOWN";
      } else {
        effectiveState = originalState;
      }
      stalenessReason = overrideReason || (elapsedSeconds >= 600 ? "BRANCH_OFFLINE" : "TELEMETRY_TTL_EXPIRED");
    }

    return {
      observedAt: obsDate,
      expiresAt,
      ttlSeconds,
      isStale,
      freshnessStatus,
      originalState,
      effectiveState,
      stalenessReason,
      lastObservedAgoSeconds: elapsedSeconds,
    };
  }

  /**
   * Wrap any domain entity with stale metadata
   */
  wrapWithFreshness<T extends { observedAt?: Date | string; state?: string; status?: string }>(
    data: T,
    ttlSeconds: number,
    currentTime: Date = new Date(),
    overrideReason?: string
  ): FreshnessWrapper<T> {
    const observedAt = data.observedAt || new Date();
    const originalState = data.state || data.status || "HEALTHY";
    const metadata = this.evaluateMetadata(observedAt, originalState, ttlSeconds, currentTime, overrideReason);

    return {
      data,
      metadata,
    };
  }

  /**
   * Resolves device state respecting branch connectivity and telemetry TTL
   */
  resolveDeviceState(
    deviceId: string,
    originalState: string,
    observedAt: Date | string,
    isBranchOnline: boolean,
    ttlSeconds: number = DEFAULT_OBSERVATION_TTLS.CAMERA_HEALTH_TTL_SECONDS,
    currentTime: Date = new Date()
  ): { effectiveState: string; isStale: boolean; reason?: string | undefined } {
    if (!isBranchOnline) {
      return {
        effectiveState: "UNKNOWN",
        isStale: true,
        reason: "BRANCH_OFFLINE",
      };
    }

    const meta = this.evaluateMetadata(observedAt, originalState, ttlSeconds, currentTime);
    return {
      effectiveState: meta.effectiveState,
      isStale: meta.isStale,
      reason: meta.stalenessReason,
    };
  }
}

export const staleDataEvaluatorService = new StaleDataEvaluatorService();
