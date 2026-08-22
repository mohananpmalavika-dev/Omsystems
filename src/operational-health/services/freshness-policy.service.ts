import type {
  EntityType,
  FreshnessPolicy,
  HealthObservation,
} from "../domain/stale-semantics.types.js";

export const DEFAULT_FRESHNESS_POLICIES: Record<EntityType, FreshnessPolicy> = {
  INTERNET: {
    entityType: "INTERNET",
    expectedIntervalSeconds: 15,
    warningAfterSeconds: 30,
    staleAfterSeconds: 60,
  },
  EDGE_GATEWAY: {
    entityType: "EDGE_GATEWAY",
    expectedIntervalSeconds: 15,
    warningAfterSeconds: 30,
    staleAfterSeconds: 60,
  },
  ROUTER: {
    entityType: "ROUTER",
    expectedIntervalSeconds: 15,
    warningAfterSeconds: 30,
    staleAfterSeconds: 60,
  },
  SWITCH: {
    entityType: "SWITCH",
    expectedIntervalSeconds: 20,
    warningAfterSeconds: 45,
    staleAfterSeconds: 90,
  },
  RECORDER: {
    entityType: "RECORDER",
    expectedIntervalSeconds: 30,
    warningAfterSeconds: 60,
    staleAfterSeconds: 120,
  },
  CAMERA: {
    entityType: "CAMERA",
    expectedIntervalSeconds: 30,
    warningAfterSeconds: 60,
    staleAfterSeconds: 120,
  },
  RECORDING: {
    entityType: "RECORDING",
    expectedIntervalSeconds: 60,
    warningAfterSeconds: 120,
    staleAfterSeconds: 300,
  },
  DISK: {
    entityType: "DISK",
    expectedIntervalSeconds: 60,
    warningAfterSeconds: 180,
    staleAfterSeconds: 300,
  },
  NTP: {
    entityType: "NTP",
    expectedIntervalSeconds: 60,
    warningAfterSeconds: 180,
    staleAfterSeconds: 300,
  },
  VPN: {
    entityType: "VPN",
    expectedIntervalSeconds: 15,
    warningAfterSeconds: 30,
    staleAfterSeconds: 60,
  },
  BRANCH: {
    entityType: "BRANCH",
    expectedIntervalSeconds: 15,
    warningAfterSeconds: 30,
    staleAfterSeconds: 60,
  },
};

const MAX_ACCEPTABLE_FUTURE_DRIFT_MS = 5000; // 5 seconds

export class FreshnessPolicyService {
  private readonly policies = new Map<EntityType, FreshnessPolicy>(
    Object.entries(DEFAULT_FRESHNESS_POLICIES) as [EntityType, FreshnessPolicy][],
  );

  getPolicy(entityType: EntityType): FreshnessPolicy {
    return (
      this.policies.get(entityType) ?? {
        entityType,
        expectedIntervalSeconds: 30,
        warningAfterSeconds: 60,
        staleAfterSeconds: 120,
      }
    );
  }

  setCustomPolicy(policy: FreshnessPolicy): void {
    this.policies.set(policy.entityType, policy);
  }

  /**
   * Derives expiresAt and receivedAt timestamps, with clock-drift protection.
   */
  enrichObservationWithTimestamps<T>(
    observation: HealthObservation<T>,
    receivedAt: Date = new Date(),
  ): HealthObservation<T> {
    const rawObservedAt =
      observation.observedAt instanceof Date
        ? observation.observedAt
        : new Date(observation.observedAt);

    // Clock drift guard: if edge timestamp is far in future compared to receivedAt, cap it
    const effectiveObservedAt =
      rawObservedAt.getTime() > receivedAt.getTime() + MAX_ACCEPTABLE_FUTURE_DRIFT_MS
        ? receivedAt
        : rawObservedAt;

    const policy = this.getPolicy(observation.entityType);
    const expiresAt = new Date(
      effectiveObservedAt.getTime() + policy.staleAfterSeconds * 1000,
    );

    return {
      ...observation,
      observedAt: effectiveObservedAt,
      receivedAt,
      expiresAt,
    };
  }
}

export const freshnessPolicyService = new FreshnessPolicyService();
