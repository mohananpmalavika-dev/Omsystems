/**
 * Capability-Aware Device Health Evaluation Engine
 * 
 * Implements strict, conservative health evaluation rules based on observed evidence
 * and declared capability support profiles.
 * 
 * Strict Invariants:
 *  - NO EVIDENCE ≠ HEALTHY
 *  - UNSUPPORTED ≠ UNKNOWN (Unsupported features do not penalize health)
 *  - STALE EVIDENCE → UNKNOWN
 *  - REQUIRED Metric Failure → Overall FAILURE
 *  - REQUIRED Metric Missing → Overall UNKNOWN
 */

import type {
  DeviceCapability,
  DeviceCapabilityProfile,
  DeviceCapabilityRecord,
  DeviceEvidence,
  DeviceHealthMetric,
  DeviceHealthSnapshot,
  HealthState,
} from "../domain/device-health.types.js";

export class HealthEvaluatorEngine {
  evaluateMetric(
    capRecord: DeviceCapabilityRecord,
    evidence?: DeviceEvidence | undefined,
    now = new Date()
  ): DeviceHealthMetric {
    const { capability, support, importance } = capRecord;

    // 1. If Capability is UNSUPPORTED by the device hardware/firmware
    if (support === "UNSUPPORTED") {
      return {
        capability,
        capabilitySupport: "UNSUPPORTED",
        importance,
        healthState: "UNSUPPORTED",
        message: "Not supported by device hardware or firmware",
        confidence: capRecord.confidence,
      };
    }

    // 2. If Capability is supported or partial, but NO evidence or STALE/ERROR
    if (!evidence || evidence.status !== "AVAILABLE") {
      const statusDesc = evidence?.status === "STALE"
        ? (evidence.errorMessage || "Evidence stale")
        : evidence?.status === "ERROR"
        ? (evidence.errorMessage || "Collection error")
        : "Evidence unavailable";

      return {
        capability,
        capabilitySupport: support,
        importance,
        healthState: "UNKNOWN",
        message: statusDesc,
        source: evidence?.source,
        observedAt: evidence?.observedAt,
        evidenceAgeSeconds: evidence?.observedAt ? Math.floor((now.getTime() - evidence.observedAt.getTime()) / 1000) : undefined,
        confidence: capRecord.confidence * 0.5,
      };
    }

    // 3. Evidence is AVAILABLE: Evaluate domain rules per capability
    const ageSeconds = Math.floor((now.getTime() - evidence.observedAt.getTime()) / 1000);
    const value = evidence.value as any;

    switch (capability) {
      case "DEVICE_ONLINE": {
        const isOnline = Boolean(value);
        return {
          capability,
          capabilitySupport: support,
          importance,
          healthState: isOnline ? "HEALTHY" : "FAILURE",
          value: isOnline,
          message: isOnline ? "Device is online and responsive" : "Device unreachable on IP network",
          source: evidence.source,
          observedAt: evidence.observedAt,
          evidenceAgeSeconds: ageSeconds,
          confidence: capRecord.confidence,
        };
      }

      case "RECORDING_STATUS": {
        const total = Number(value?.totalChannels ?? value?.total ?? 16);
        const recording = Number(value?.recordingChannels ?? value?.recording ?? 0);
        if (recording === total && total > 0) {
          return {
            capability,
            capabilitySupport: support,
            importance,
            healthState: "HEALTHY",
            value: `${recording}/${total}`,
            message: `All ${recording} channels recording actively`,
            source: evidence.source,
            observedAt: evidence.observedAt,
            evidenceAgeSeconds: ageSeconds,
            confidence: capRecord.confidence,
          };
        } else if (recording > 0) {
          return {
            capability,
            capabilitySupport: support,
            importance,
            healthState: "WARNING",
            value: `${recording}/${total}`,
            message: `${total - recording} channel(s) stopped recording (${recording}/${total})`,
            source: evidence.source,
            observedAt: evidence.observedAt,
            evidenceAgeSeconds: ageSeconds,
            confidence: capRecord.confidence,
          };
        } else {
          return {
            capability,
            capabilitySupport: support,
            importance,
            healthState: "FAILURE",
            value: `${recording}/${total}`,
            message: `No active recording across all ${total} channels`,
            source: evidence.source,
            observedAt: evidence.observedAt,
            evidenceAgeSeconds: ageSeconds,
            confidence: capRecord.confidence,
          };
        }
      }

      case "CHANNEL_STATUS": {
        const total = Number(value?.totalChannels ?? value?.total ?? 16);
        const connected = Number(value?.connectedChannels ?? value?.connected ?? 0);
        if (connected === total && total > 0) {
          return {
            capability,
            capabilitySupport: support,
            importance,
            healthState: "HEALTHY",
            value: `${connected}/${total}`,
            message: `All ${connected} camera channels connected`,
            source: evidence.source,
            observedAt: evidence.observedAt,
            evidenceAgeSeconds: ageSeconds,
            confidence: capRecord.confidence,
          };
        } else if (connected > 0) {
          return {
            capability,
            capabilitySupport: support,
            importance,
            healthState: "WARNING",
            value: `${connected}/${total}`,
            message: `${total - connected} camera channel(s) disconnected (${connected}/${total})`,
            source: evidence.source,
            observedAt: evidence.observedAt,
            evidenceAgeSeconds: ageSeconds,
            confidence: capRecord.confidence,
          };
        } else {
          return {
            capability,
            capabilitySupport: support,
            importance,
            healthState: "FAILURE",
            value: `${connected}/${total}`,
            message: "All camera channels disconnected",
            source: evidence.source,
            observedAt: evidence.observedAt,
            evidenceAgeSeconds: ageSeconds,
            confidence: capRecord.confidence,
          };
        }
      }

      case "RETENTION_VERIFICATION": {
        const required = Number(value?.requiredDays ?? 90);
        const actual = Number(value?.actualDays ?? 0);
        if (actual >= required) {
          return {
            capability,
            capabilitySupport: support,
            importance,
            healthState: "HEALTHY",
            value: actual,
            unit: "days",
            message: `Retention compliant (${actual.toFixed(1)} / ${required} days)`,
            source: evidence.source,
            observedAt: evidence.observedAt,
            evidenceAgeSeconds: ageSeconds,
            confidence: capRecord.confidence,
          };
        } else if (actual >= required * 0.9) {
          return {
            capability,
            capabilitySupport: support,
            importance,
            healthState: "WARNING",
            value: actual,
            unit: "days",
            message: `Retention nearing threshold (${actual.toFixed(1)} / ${required} days)`,
            source: evidence.source,
            observedAt: evidence.observedAt,
            evidenceAgeSeconds: ageSeconds,
            confidence: capRecord.confidence,
          };
        } else {
          return {
            capability,
            capabilitySupport: support,
            importance,
            healthState: "FAILURE",
            value: actual,
            unit: "days",
            message: `Retention policy violation (${actual.toFixed(1)} / ${required} days, ${(required - actual).toFixed(1)}d deficit)`,
            source: evidence.source,
            observedAt: evidence.observedAt,
            evidenceAgeSeconds: ageSeconds,
            confidence: capRecord.confidence,
          };
        }
      }

      case "DEVICE_TEMPERATURE": {
        const temp = typeof value === "number" ? value : Number(value?.celsius ?? value?.temperature ?? 40);
        if (isNaN(temp)) {
          return {
            capability,
            capabilitySupport: support,
            importance,
            healthState: "UNKNOWN",
            message: "Temperature telemetry invalid",
            source: evidence.source,
            observedAt: evidence.observedAt,
            evidenceAgeSeconds: ageSeconds,
            confidence: capRecord.confidence * 0.5,
          };
        }
        if (temp >= 80) {
          return {
            capability,
            capabilitySupport: support,
            importance,
            healthState: "FAILURE",
            value: temp,
            unit: "°C",
            message: `Critical temperature: ${temp}°C`,
            source: evidence.source,
            observedAt: evidence.observedAt,
            evidenceAgeSeconds: ageSeconds,
            confidence: capRecord.confidence,
          };
        } else if (temp >= 65) {
          return {
            capability,
            capabilitySupport: support,
            importance,
            healthState: "WARNING",
            value: temp,
            unit: "°C",
            message: `Elevated temperature: ${temp}°C`,
            source: evidence.source,
            observedAt: evidence.observedAt,
            evidenceAgeSeconds: ageSeconds,
            confidence: capRecord.confidence,
          };
        } else {
          return {
            capability,
            capabilitySupport: support,
            importance,
            healthState: "HEALTHY",
            value: temp,
            unit: "°C",
            message: `Normal temperature: ${temp}°C`,
            source: evidence.source,
            observedAt: evidence.observedAt,
            evidenceAgeSeconds: ageSeconds,
            confidence: capRecord.confidence,
          };
        }
      }

      case "TIME_DRIFT": {
        const drift = Math.abs(typeof value === "number" ? value : Number(value?.driftSeconds ?? 0));
        if (drift >= 120) {
          return {
            capability,
            capabilitySupport: support,
            importance,
            healthState: "FAILURE",
            value: drift,
            unit: "seconds",
            message: `Severe clock drift: ${drift.toFixed(1)}s (exceeds 120s limit)`,
            source: evidence.source,
            observedAt: evidence.observedAt,
            evidenceAgeSeconds: ageSeconds,
            confidence: capRecord.confidence,
          };
        } else if (drift >= 30) {
          return {
            capability,
            capabilitySupport: support,
            importance,
            healthState: "WARNING",
            value: drift,
            unit: "seconds",
            message: `Moderate clock drift: ${drift.toFixed(1)}s`,
            source: evidence.source,
            observedAt: evidence.observedAt,
            evidenceAgeSeconds: ageSeconds,
            confidence: capRecord.confidence,
          };
        } else {
          return {
            capability,
            capabilitySupport: support,
            importance,
            healthState: "HEALTHY",
            value: drift,
            unit: "seconds",
            message: `Clock synchronized (drift ${drift.toFixed(1)}s)`,
            source: evidence.source,
            observedAt: evidence.observedAt,
            evidenceAgeSeconds: ageSeconds,
            confidence: capRecord.confidence,
          };
        }
      }

      case "SMART_STATUS": {
        const smart = String(value?.status ?? value ?? "PASSED").toUpperCase();
        if (smart === "PASSED" || smart === "OK") {
          return {
            capability,
            capabilitySupport: support,
            importance,
            healthState: "HEALTHY",
            value: smart,
            message: "SMART health check passed",
            source: evidence.source,
            observedAt: evidence.observedAt,
            evidenceAgeSeconds: ageSeconds,
            confidence: capRecord.confidence,
          };
        } else if (smart === "WARNING" || smart === "DEGRADED") {
          return {
            capability,
            capabilitySupport: support,
            importance,
            healthState: "WARNING",
            value: smart,
            message: "SMART health warning detected",
            source: evidence.source,
            observedAt: evidence.observedAt,
            evidenceAgeSeconds: ageSeconds,
            confidence: capRecord.confidence,
          };
        } else {
          return {
            capability,
            capabilitySupport: support,
            importance,
            healthState: "FAILURE",
            value: smart,
            message: "SMART health check failed (hardware fault predicted)",
            source: evidence.source,
            observedAt: evidence.observedAt,
            evidenceAgeSeconds: ageSeconds,
            confidence: capRecord.confidence,
          };
        }
      }

      default: {
        return {
          capability,
          capabilitySupport: support,
          importance,
          healthState: "HEALTHY",
          value,
          message: `${capability} verified normal`,
          source: evidence.source,
          observedAt: evidence.observedAt,
          evidenceAgeSeconds: ageSeconds,
          confidence: capRecord.confidence,
        };
      }
    }
  }

  evaluateSnapshot(
    profile: DeviceCapabilityProfile,
    evidenceList: DeviceEvidence[],
    options: {
      tenantId: string;
      branchId?: string | undefined;
      branchName?: string | undefined;
      now?: Date | undefined;
    }
  ): DeviceHealthSnapshot {
    const now = options.now || new Date();
    const evidenceMap = new Map(evidenceList.map((e) => [e.capability, e]));
    const metrics: DeviceHealthMetric[] = [];
    const headlineReasons: string[] = [];

    let criticalFailures = 0;
    let warnings = 0;
    let unknowns = 0;
    let unsupporteds = 0;

    for (const capRecord of profile.capabilities) {
      const ev = evidenceMap.get(capRecord.capability);
      const metric = this.evaluateMetric(capRecord, ev, now);
      metrics.push(metric);

      if (metric.healthState === "FAILURE") {
        criticalFailures++;
        if (metric.importance === "REQUIRED" || metric.importance === "RECOMMENDED") {
          headlineReasons.push(metric.message);
        }
      } else if (metric.healthState === "WARNING") {
        warnings++;
        if (metric.importance === "REQUIRED" || metric.importance === "RECOMMENDED") {
          headlineReasons.push(metric.message);
        }
      } else if (metric.healthState === "UNKNOWN") {
        unknowns++;
        if (metric.importance === "REQUIRED") {
          headlineReasons.push(`Required evidence missing for ${metric.capability}`);
        }
      } else if (metric.healthState === "UNSUPPORTED") {
        unsupporteds++;
      }
    }

    // Conservative Overall Headline Calculation
    let overallState: HealthState = "HEALTHY";

    // 1. Any REQUIRED metric failure → Overall FAILURE
    const hasRequiredFailure = metrics.some(
      (m) => m.importance === "REQUIRED" && m.healthState === "FAILURE"
    );
    // 2. Any REQUIRED metric unknown → Overall UNKNOWN
    const hasRequiredUnknown = metrics.some(
      (m) => m.importance === "REQUIRED" && m.healthState === "UNKNOWN"
    );
    // 3. Any Warning → Overall WARNING
    const hasWarning = metrics.some((m) => m.healthState === "WARNING");

    if (hasRequiredFailure) {
      overallState = "FAILURE";
    } else if (hasRequiredUnknown) {
      overallState = "UNKNOWN";
    } else if (hasWarning) {
      overallState = "WARNING";
    } else {
      overallState = "HEALTHY";
    }

    return {
      deviceId: profile.deviceId,
      tenantId: options.tenantId,
      branchId: options.branchId,
      branchName: options.branchName,
      manufacturer: profile.manufacturer,
      model: profile.model,
      firmwareVersion: profile.firmwareVersion,
      overallState,
      evaluatedAt: now,
      headlineReasons,
      metrics,
      criticalFailures,
      warnings,
      unknowns,
      unsupporteds,
    };
  }
}

export const healthEvaluatorEngine = new HealthEvaluatorEngine();
