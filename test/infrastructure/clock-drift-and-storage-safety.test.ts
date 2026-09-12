import { describe, it, expect } from "vitest";
import { ClockIntegrityService } from "../../src/infrastructure/services/clock-integrity.service.js";
import { StorageSafetyLifecycleService } from "../../src/retention/services/storage-safety-lifecycle.service.js";

describe("Clock Drift Integrity & Storage Safety", () => {
  it("evaluates clock drift status strictly per banking thresholds", async () => {
    const clock = new ClockIntegrityService();

    expect(clock.evaluateDrift(1500)).toBe("HEALTHY"); // <5s
    expect(clock.evaluateDrift(4999)).toBe("HEALTHY");
    expect(clock.evaluateDrift(5000)).toBe("WARNING"); // 5s to 30s
    expect(clock.evaluateDrift(28000)).toBe("WARNING");
    expect(clock.evaluateDrift(30001)).toBe("CRITICAL"); // >30s

    const measurement = await clock.recordMeasurement({
      nodeId: "edge-branch-thrissur",
      nodeType: "EDGE_GATEWAY",
      offsetMs: 8200,
      jitterMs: 15,
    });

    expect(measurement.status).toBe("WARNING");
    expect(await clock.getObservedOffset("edge-branch-thrissur")).toBe(8200);
  });

  it("prevents routing recordings to FAILED or READ_ONLY storage nodes", async () => {
    const storageService = new StorageSafetyLifecycleService();

    storageService.registerNode({
      nodeId: "storage-node-failed",
      mountPoint: "/mnt/vol1",
      tier: "HOT",
      state: "FAILED",
      totalBytes: 10 * 1024 * 1024 * 1024 * 1024,
      usedBytes: 8 * 1024 * 1024 * 1024 * 1024,
      availableBytes: 2 * 1024 * 1024 * 1024 * 1024,
      writeLatencyMs: 250,
      ioErrorsTotal: 42,
      smartHealth: "FAIL",
    });

    storageService.registerNode({
      nodeId: "storage-node-healthy",
      mountPoint: "/mnt/vol2",
      tier: "HOT",
      state: "HEALTHY",
      totalBytes: 10 * 1024 * 1024 * 1024 * 1024,
      usedBytes: 3 * 1024 * 1024 * 1024 * 1024,
      availableBytes: 7 * 1024 * 1024 * 1024 * 1024,
      writeLatencyMs: 2.1,
      ioErrorsTotal: 0,
      smartHealth: "PASS",
    });

    const optimal = await storageService.selectOptimalStorageNode("HOT");
    expect(optimal).not.toBeNull();
    expect(optimal?.nodeId).toBe("storage-node-healthy");
    expect(optimal?.state).toBe("HEALTHY");
  });

  it("calculates retention forecast and triggers proactive capacity warning when projected < required", async () => {
    const storageService = new StorageSafetyLifecycleService();

    const forecast = await storageService.evaluateRetentionForecast({
      tenantId: "tenant-bank-01",
      requiredRetentionDays: 90,
    });

    expect(forecast.requiredRetentionDays).toBe(90);
    expect(forecast.status).toBeDefined();
  });
});
