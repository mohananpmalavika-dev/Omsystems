import type {
  BranchTelemetrySummary,
  EffectiveHealthState,
  HealthObservation,
  OperationalHealth,
} from "../domain/stale-semantics.types.js";
import { healthFreshnessEvaluator } from "./health-freshness-evaluator.service.js";
import { freshnessPolicyService } from "./freshness-policy.service.js";

export interface BranchDeviceObservations {
  branchId: string;
  branchName?: string;
  internet?: HealthObservation;
  router?: HealthObservation;
  switch?: HealthObservation;
  recorders: HealthObservation[];
  cameras: HealthObservation[];
  disks: HealthObservation[];
}

export class StaleDependencyIntegratorService {
  /**
   * Evaluates branch-wide observations using the Digital Twin dependency topology.
   */
  evaluateBranchTelemetry(
    branchData: BranchDeviceObservations,
    now: Date = new Date(),
  ): BranchTelemetrySummary {
    const evaluatedEntities: OperationalHealth[] = [];

    // 1. Evaluate WAN / Internet
    const wanObs = branchData.internet
      ? freshnessPolicyService.enrichObservationWithTimestamps(branchData.internet, now)
      : null;
    const evaluatedWan = wanObs
      ? healthFreshnessEvaluator.evaluateFreshness(wanObs, now)
      : null;

    if (evaluatedWan) {
      evaluatedEntities.push(evaluatedWan);
    }

    const isWanOffline =
      !evaluatedWan ||
      evaluatedWan.state === "CRITICAL" ||
      evaluatedWan.observedStatus === "CRITICAL";

    // 2. Evaluate Router & Switch
    const routerObs = branchData.router
      ? freshnessPolicyService.enrichObservationWithTimestamps(branchData.router, now)
      : null;
    const evaluatedRouter = routerObs
      ? healthFreshnessEvaluator.evaluateFreshness(routerObs, now, {
          isBranchNetworkOffline: isWanOffline,
        })
      : null;
    if (evaluatedRouter) evaluatedEntities.push(evaluatedRouter);

    const isNetworkOffline = isWanOffline || evaluatedRouter?.state === "CRITICAL";

    const switchObs = branchData.switch
      ? freshnessPolicyService.enrichObservationWithTimestamps(branchData.switch, now)
      : null;
    const evaluatedSwitch = switchObs
      ? healthFreshnessEvaluator.evaluateFreshness(switchObs, now, {
          isBranchNetworkOffline: isNetworkOffline,
        })
      : null;
    if (evaluatedSwitch) evaluatedEntities.push(evaluatedSwitch);

    const isSwitchOffline = isNetworkOffline || evaluatedSwitch?.state === "CRITICAL";

    // 3. Evaluate Recorders
    const evaluatedRecorders: OperationalHealth[] = [];
    for (const rec of branchData.recorders) {
      const enriched = freshnessPolicyService.enrichObservationWithTimestamps(rec, now);
      const evaluated = healthFreshnessEvaluator.evaluateFreshness(enriched, now, {
        isBranchNetworkOffline: isSwitchOffline,
      });
      evaluatedRecorders.push(evaluated);
      evaluatedEntities.push(evaluated);
    }

    const anyRecorderOffline = evaluatedRecorders.some((r) => r.state === "CRITICAL");
    const allRecordersUnknown =
      evaluatedRecorders.length > 0 && evaluatedRecorders.every((r) => r.state === "UNKNOWN");

    // 4. Evaluate Cameras
    for (const cam of branchData.cameras) {
      const enriched = freshnessPolicyService.enrichObservationWithTimestamps(cam, now);
      const evaluated = healthFreshnessEvaluator.evaluateFreshness(enriched, now, {
        isBranchNetworkOffline: isSwitchOffline,
        isRecorderOffline: anyRecorderOffline || allRecordersUnknown,
      });
      evaluatedEntities.push(evaluated);
    }

    // 5. Evaluate HDDs / Disks
    for (const disk of branchData.disks) {
      const enriched = freshnessPolicyService.enrichObservationWithTimestamps(disk, now);
      const evaluated = healthFreshnessEvaluator.evaluateFreshness(enriched, now, {
        isBranchNetworkOffline: isSwitchOffline,
        isRecorderOffline: anyRecorderOffline || allRecordersUnknown,
      });
      evaluatedEntities.push(evaluated);
    }

    // 6. Aggregate Branch Metrics
    const healthyCount = evaluatedEntities.filter((e) => e.state === "HEALTHY").length;
    const warningCount = evaluatedEntities.filter((e) => e.state === "WARNING").length;
    const criticalCount = evaluatedEntities.filter((e) => e.state === "CRITICAL").length;
    const unknownCount = evaluatedEntities.filter((e) => e.state === "UNKNOWN").length;
    const staleCount = evaluatedEntities.filter((e) => e.freshness === "STALE").length;
    const freshCount = evaluatedEntities.filter((e) => e.freshness === "FRESH").length;

    let branchStatus: EffectiveHealthState = "HEALTHY";
    let monitoringVisibility: "FULL" | "DEGRADED" | "UNAVAILABLE" = "FULL";

    if (isWanOffline || isNetworkOffline) {
      branchStatus = "CRITICAL";
      monitoringVisibility = "UNAVAILABLE";
    } else if (criticalCount > 0) {
      branchStatus = "CRITICAL";
      monitoringVisibility = unknownCount > 0 ? "DEGRADED" : "FULL";
    } else if (warningCount > 0 || unknownCount > 0 || staleCount > 0) {
      branchStatus = "WARNING";
      monitoringVisibility = unknownCount > 0 ? "DEGRADED" : "FULL";
    }

    // 7. Determine Root Cause
    let rootCause: BranchTelemetrySummary["rootCause"] = undefined;
    if (isWanOffline) {
      rootCause = {
        entityId: evaluatedWan?.entityId ?? "WAN-01",
        entityType: "INTERNET",
        status: "CRITICAL",
        reasonCode: "INTERNET_OFFLINE",
        reason: "Branch Internet connection is offline or unverified",
        detectedAt: evaluatedWan?.observedAt ?? now.toISOString(),
      };
    } else if (evaluatedRouter?.state === "CRITICAL") {
      rootCause = {
        entityId: evaluatedRouter.entityId,
        entityType: "ROUTER",
        status: "CRITICAL",
        reasonCode: "UPSTREAM_DEPENDENCY_UNAVAILABLE",
        reason: "Branch Gateway Router is unreachable",
        detectedAt: evaluatedRouter.observedAt ?? now.toISOString(),
      };
    } else if (evaluatedSwitch?.state === "CRITICAL") {
      rootCause = {
        entityId: evaluatedSwitch.entityId,
        entityType: "SWITCH",
        status: "CRITICAL",
        reasonCode: "UPSTREAM_DEPENDENCY_UNAVAILABLE",
        reason: "Branch Switch is unreachable",
        detectedAt: evaluatedSwitch.observedAt ?? now.toISOString(),
      };
    }

    return {
      branchId: branchData.branchId,
      branchName: branchData.branchName ?? `Branch ${branchData.branchId}`,
      branchStatus,
      monitoringVisibility,
      rootCause,
      metrics: {
        totalEntities: evaluatedEntities.length,
        healthyCount,
        warningCount,
        criticalCount,
        unknownCount,
        staleCount,
        freshCount,
      },
      entities: evaluatedEntities,
      generatedAt: now.toISOString(),
    };
  }
}

export const staleDependencyIntegrator = new StaleDependencyIntegratorService();
