import { describe, expect, it } from "vitest";
import { DeviceCapabilityRegistry } from "../src/device-health/capabilities/device-capability-profiles.js";
import { DeviceEvidenceStore } from "../src/device-health/evidence/device-evidence.store.js";
import { HealthEvaluatorEngine } from "../src/device-health/evaluation/health-evaluator.engine.js";
import { DeviceHealthService } from "../src/device-health/services/device-health.service.js";
import type { DeviceCapabilityProfile, DeviceEvidence } from "../src/device-health/domain/device-health.types.js";

const now = new Date("2026-09-08T12:00:00.000Z");

function evidence(value: unknown, observedAt = now): DeviceEvidence {
  return {
    deviceId: "recorder-1", capability: "DEVICE_ONLINE", status: "AVAILABLE", value,
    source: "RECORDER_API", observedAt, collectedAt: now,
  };
}

describe("device health scan evidence", () => {
  it("does not let a late scan result overwrite newer device evidence", () => {
    const store = new DeviceEvidenceStore();
    store.put(evidence(true, now));
    store.put(evidence(false, new Date(now.getTime() - 60_000)));
    expect(store.get("recorder-1", "DEVICE_ONLINE", now)?.value).toBe(true);
  });

  it("normalizes an edge clock far ahead of collection time", () => {
    const store = new DeviceEvidenceStore();
    store.put(evidence(true, new Date(now.getTime() + 10 * 60_000)));
    expect(store.get("recorder-1", "DEVICE_ONLINE", now)?.observedAt.toISOString()).toBe(now.toISOString());
  });

  it("does not report malformed availability telemetry as healthy", () => {
    const engine = new HealthEvaluatorEngine();
    const profile = profileWith("DEVICE_ONLINE", "REQUIRED");
    const metric = engine.evaluateMetric(profile.capabilities[0]!, evidence("reachable"), now);
    expect(metric.healthState).toBe("UNKNOWN");
  });

  it("surfaces a recommended metric failure as a warning", () => {
    const registry = new DeviceCapabilityRegistry();
    const store = new DeviceEvidenceStore();
    const engine = new HealthEvaluatorEngine();
    const service = new DeviceHealthService(registry, store, engine);
    registry.registerProfile(profileWith("SMART_STATUS", "RECOMMENDED"));
    store.put({ ...evidence("FAILED"), capability: "SMART_STATUS" });
    expect(service.getHealthSnapshot("recorder-1", "tenant", { now }).overallState).toBe("WARNING");
  });
});

function profileWith(capability: DeviceCapabilityProfile["capabilities"][number]["capability"], importance: "REQUIRED" | "RECOMMENDED"): DeviceCapabilityProfile {
  return {
    deviceId: "recorder-1",
    capabilities: [{ capability, support: "SUPPORTED", importance, source: "PROBE", confidence: 1, discoveredAt: now }],
  };
}
