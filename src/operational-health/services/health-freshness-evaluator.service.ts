import type {
  EffectiveHealthState,
  EntityType,
  FreshnessState,
  HealthObservation,
  HealthReasonCode,
  OperationalHealth,
} from "../domain/stale-semantics.types.js";
import { HEALTH_REASON_LABELS } from "../domain/stale-semantics.types.js";
import { freshnessPolicyService } from "./freshness-policy.service.js";

export interface DependencyContext {
  parentEntityType?: EntityType;
  parentEntityId?: string;
  parentHealthState?: EffectiveHealthState;
  isBranchNetworkOffline?: boolean;
  isRecorderOffline?: boolean;
}

export class HealthFreshnessEvaluatorService {
  /**
   * Evaluates an observation's freshness and applies dependency reasoning to produce the Effective Health State.
   */
  evaluateFreshness<T = unknown>(
    observation: HealthObservation<T> | null | undefined,
    now: Date = new Date(),
    dependencyContext?: DependencyContext,
  ): OperationalHealth<T> {
    if (!observation) {
      return {
        entityId: "UNKNOWN",
        entityType: "BRANCH",
        state: "UNKNOWN",
        freshness: "NEVER_OBSERVED",
        ageSeconds: 0,
        reasonCode: "NO_OBSERVATION",
        reason: HEALTH_REASON_LABELS.NO_OBSERVATION,
      };
    }

    const policy = freshnessPolicyService.getPolicy(observation.entityType);
    const observedAtDate =
      observation.observedAt instanceof Date
        ? observation.observedAt
        : new Date(observation.observedAt);
    const expiresAtDate =
      observation.expiresAt instanceof Date
        ? observation.expiresAt
        : observation.expiresAt
          ? new Date(observation.expiresAt)
          : new Date(observedAtDate.getTime() + policy.staleAfterSeconds * 1000);

    const receivedAtDate =
      observation.receivedAt instanceof Date
        ? observation.receivedAt
        : observation.receivedAt
          ? new Date(observation.receivedAt)
          : observedAtDate;

    const ageSeconds = Math.max(0, Math.floor((now.getTime() - observedAtDate.getTime()) / 1000));
    const isExpired = now.getTime() > expiresAtDate.getTime();
    const staleForSeconds = isExpired
      ? Math.floor((now.getTime() - expiresAtDate.getTime()) / 1000)
      : undefined;

    // 1. Freshness State Determination
    let freshness: FreshnessState = "FRESH";
    if (isExpired) {
      freshness = "STALE";
    } else if (ageSeconds > policy.warningAfterSeconds) {
      freshness = "AGING";
    }

    // 2. Dependency Evaluation (Digital Twin Parent Checks)
    let state: EffectiveHealthState = observation.health;
    let reasonCode: HealthReasonCode | undefined = observation.reasonCode;
    let reason: string | undefined = observation.reason;

    if (dependencyContext?.isBranchNetworkOffline) {
      state = "UNKNOWN";
      reasonCode = "BRANCH_OFFLINE";
      reason = HEALTH_REASON_LABELS.BRANCH_OFFLINE;
    } else if (dependencyContext?.isRecorderOffline && observation.entityType === "CAMERA") {
      state = "UNKNOWN";
      reasonCode = "RECORDER_UNREACHABLE";
      reason = HEALTH_REASON_LABELS.RECORDER_UNREACHABLE;
    } else if (
      dependencyContext?.parentHealthState === "CRITICAL" ||
      dependencyContext?.parentHealthState === "UNKNOWN"
    ) {
      state = "UNKNOWN";
      reasonCode = "UPSTREAM_DEPENDENCY_UNAVAILABLE";
      reason = `${HEALTH_REASON_LABELS.UPSTREAM_DEPENDENCY_UNAVAILABLE} (${dependencyContext.parentEntityType ?? "Parent Device"})`;
    }

    // 3. Stale Data Overrides: If TTL expired and not already marked by dependency
    if (freshness === "STALE" && state !== "CRITICAL") {
      state = "UNKNOWN";
      reasonCode ??= "OBSERVATION_EXPIRED";
      reason ??= HEALTH_REASON_LABELS.OBSERVATION_EXPIRED;
    }

    return {
      entityId: observation.entityId,
      entityType: observation.entityType,
      branchId: observation.branchId,
      state,
      freshness,
      observedStatus: observation.health,
      observedAt: observedAtDate.toISOString(),
      receivedAt: receivedAtDate.toISOString(),
      expiresAt: expiresAtDate.toISOString(),
      ageSeconds,
      staleForSeconds,
      source: observation.source,
      reasonCode,
      reason,
      lastKnownState: observation.health,
      value: observation.data,
    };
  }
}

export const healthFreshnessEvaluator = new HealthFreshnessEvaluatorService();
