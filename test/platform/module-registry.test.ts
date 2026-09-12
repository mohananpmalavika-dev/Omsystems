import { describe, expect, it } from "vitest";
import { ModuleRegistry } from "../../src/platform/module-registry.service.js";

describe("Production Module Readiness Registry (P0 Phase 3)", () => {
  it("initializes with core modules in STARTING state and reports UNREADY", () => {
    const registry = new ModuleRegistry();
    const evalResult = registry.evaluateReadiness();

    expect(evalResult.overall).toBe("UNREADY");
    expect(evalResult.isReady).toBe(false);
    expect(evalResult.statusCode).toBe(503);
    expect(evalResult.failedCriticalModules.length).toBeGreaterThan(0);
    expect(evalResult.failedCriticalModules).toContain("database");
    expect(evalResult.failedCriticalModules).toContain("redis");
  });

  it("reports READY (HTTP 200) once all critical and required modules transition to READY", () => {
    const registry = new ModuleRegistry();

    registry.updateStatus("database", "READY", "Connected to PostgreSQL");
    registry.updateStatus("redis", "READY", "Connected to Redis Cluster");
    registry.updateStatus("eventBus", "READY", "Connected");
    registry.updateStatus("recordingIndex", "READY", "Indexed");
    registry.updateStatus("mediaOrchestration", "READY", "Active");
    registry.updateStatus("evidenceService", "READY", "Active");
    registry.updateStatus("identity", "READY", "Verified");
    registry.updateStatus("audit", "READY", "Verified");

    const evalResult = registry.evaluateReadiness();
    expect(evalResult.overall).toBe("READY");
    expect(evalResult.isReady).toBe(true);
    expect(evalResult.statusCode).toBe(200);
    expect(evalResult.failedCriticalModules).toHaveLength(0);
  });

  it("reports DEGRADED (HTTP 200) when an optional module degrades without failing critical ones", () => {
    const registry = new ModuleRegistry();

    registry.updateStatus("database", "READY");
    registry.updateStatus("redis", "READY");
    registry.updateStatus("eventBus", "READY");
    registry.updateStatus("recordingIndex", "READY");
    registry.updateStatus("mediaOrchestration", "READY");
    registry.updateStatus("evidenceService", "READY");
    registry.updateStatus("identity", "READY");
    registry.updateStatus("audit", "READY");

    registry.register("aiQuality", "OPTIONAL", "DEGRADED", "GPU node 2 thermal throttling");

    const evalResult = registry.evaluateReadiness();
    expect(evalResult.overall).toBe("DEGRADED");
    expect(evalResult.isReady).toBe(true);
    expect(evalResult.statusCode).toBe(200);
  });

  it("immediately reports UNREADY (HTTP 503) if database or redis becomes UNAVAILABLE", () => {
    const registry = new ModuleRegistry();

    registry.updateStatus("database", "READY");
    registry.updateStatus("redis", "READY");
    registry.updateStatus("eventBus", "READY");
    registry.updateStatus("recordingIndex", "READY");
    registry.updateStatus("mediaOrchestration", "READY");
    registry.updateStatus("evidenceService", "READY");
    registry.updateStatus("identity", "READY");
    registry.updateStatus("audit", "READY");

    // Primary database failover event
    registry.updateStatus("database", "UNAVAILABLE", "PostgreSQL primary unreachable");

    const evalResult = registry.evaluateReadiness();
    expect(evalResult.overall).toBe("UNREADY");
    expect(evalResult.isReady).toBe(false);
    expect(evalResult.statusCode).toBe(503);
    expect(evalResult.failedCriticalModules).toContain("database");
  });
});
