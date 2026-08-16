import type {
  EntityType,
  HealthObservation,
  OperationalHealth,
  TelemetryQualityReport,
} from "../domain/stale-semantics.types.js";
import { freshnessPolicyService } from "./freshness-policy.service.js";
import { healthFreshnessEvaluator } from "./health-freshness-evaluator.service.js";

export class TelemetryQualityService {
  private readonly observationStore = new Map<string, HealthObservation>();

  /**
   * Records or updates a health observation in the current-state projection.
   */
  ingestObservation<T>(observation: HealthObservation<T>, receivedAt: Date = new Date()): HealthObservation<T> {
    const key = `${observation.entityType}:${observation.entityId}`;
    const enriched = freshnessPolicyService.enrichObservationWithTimestamps(observation, receivedAt);
    this.observationStore.set(key, enriched);
    return enriched;
  }

  /**
   * Ingests a batch of observations from an Edge Health Agent.
   */
  ingestBatch(observations: HealthObservation[], receivedAt: Date = new Date()): HealthObservation[] {
    return observations.map((obs) => this.ingestObservation(obs, receivedAt));
  }

  /**
   * Retrieves the raw current observation.
   */
  getObservation(entityType: EntityType, entityId: string): HealthObservation | undefined {
    return this.observationStore.get(`${entityType}:${entityId}`);
  }

  /**
   * Evaluates and returns the effective health for a specific entity on read.
   */
  getEffectiveHealth(entityType: EntityType, entityId: string, now: Date = new Date()): OperationalHealth {
    const obs = this.getObservation(entityType, entityId);
    return healthFreshnessEvaluator.evaluateFreshness(obs, now);
  }

  /**
   * Generates a platform-wide Telemetry Quality Report across all observed entities.
   */
  generateQualityReport(now: Date = new Date()): TelemetryQualityReport {
    const branches = new Set<string>();
    const branchesWithStale = new Set<string>();
    const gaps: TelemetryQualityReport["telemetryGaps"] = [];

    const counts = {
      recorders: 0,
      cameras: 0,
      disks: 0,
      network: 0,
      total: 0,
    };

    let oldestGapSeconds = 0;

    for (const obs of this.observationStore.values()) {
      if (obs.branchId) branches.add(obs.branchId);

      const evaluated = healthFreshnessEvaluator.evaluateFreshness(obs, now);

      if (evaluated.freshness === "STALE" || evaluated.state === "UNKNOWN") {
        if (obs.branchId) branchesWithStale.add(obs.branchId);

        if (evaluated.entityType === "RECORDER") counts.recorders++;
        else if (evaluated.entityType === "CAMERA") counts.cameras++;
        else if (evaluated.entityType === "DISK") counts.disks++;
        else if (["INTERNET", "ROUTER", "SWITCH", "VPN"].includes(evaluated.entityType)) counts.network++;
        counts.total++;

        if (evaluated.ageSeconds > oldestGapSeconds) {
          oldestGapSeconds = evaluated.ageSeconds;
        }

        gaps.push({
          branchId: obs.branchId ?? "UNKNOWN_BRANCH",
          entityId: evaluated.entityId,
          entityType: evaluated.entityType,
          lastVerifiedAt: evaluated.observedAt ?? now.toISOString(),
          ageMinutes: Math.floor(evaluated.ageSeconds / 60),
          reasonCode: evaluated.reasonCode ?? "OBSERVATION_EXPIRED",
          reason: evaluated.reason ?? "Telemetry observation expired",
        });
      }
    }

    gaps.sort((a, b) => b.ageMinutes - a.ageMinutes);

    const totalBranches = Math.max(1, branches.size);
    const staleBranches = branchesWithStale.size;

    return {
      totalMonitoredBranches: branches.size,
      branchesWithStaleTelemetryCount: staleBranches,
      staleTelemetryPercentage: Math.round((staleBranches / totalBranches) * 100),
      entitiesUnknownCount: counts,
      oldestUnresolvedTelemetryGapMinutes: Math.floor(oldestGapSeconds / 60),
      telemetryGaps: gaps.slice(0, 50),
      generatedAt: now.toISOString(),
    };
  }
}

export const telemetryQualityService = new TelemetryQualityService();
