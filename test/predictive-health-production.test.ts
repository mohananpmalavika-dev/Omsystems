import { describe, expect, it } from "vitest";
import { PredictionService } from "../src/services/predictive-health/prediction.service.js";

const tenantId = "tenant-a";
const branchId = "branch-a";

function storeWithTelemetry(telemetry: any[]) {
  return {
    getNode: async () => ({ id: branchId, type: "branch", metadata: {} }),
    listLatestOperationalTelemetry: async () => telemetry,
    listIncidents: async () => [],
  } as any;
}

describe("predictive health production behavior", () => {
  it("withholds forecasts when the required telemetry sources are unavailable", async () => {
    const service = new PredictionService(storeWithTelemetry([]));
    await expect(service.predictBranchRisk(tenantId, branchId)).resolves.toEqual([]);
  });

  it("builds an explainable forecast only from observed camera, recorder, and network telemetry", async () => {
    const observedAt = new Date().toISOString();
    const service = new PredictionService(storeWithTelemetry([
      { tenantId, branchId, deviceType: "camera", deviceId: "cam-1", observedAt, metrics: { reachable: false, status: "offline" } },
      { tenantId, branchId, deviceType: "recorder", deviceId: "nvr-1", observedAt, metrics: { reachable: false, status: "offline" } },
      { tenantId, branchId, deviceType: "network", deviceId: "wan-1", observedAt, metrics: { latencyMs: 350, packetLossPercent: 8, uptimePercent: 95 } },
    ]));

    const predictions = await service.predictBranchRisk(tenantId, branchId, { horizons: [72] });

    expect(predictions).toHaveLength(1);
    expect(predictions[0]).toMatchObject({ horizonHours: 72, confidence: "LOW" });
    expect(predictions[0]!.riskFactors.length).toBeGreaterThan(0);
    expect(predictions[0]!.protectiveFactors.map((item) => item.factor)).not.toContain("Healthy HDD");
  });
});
