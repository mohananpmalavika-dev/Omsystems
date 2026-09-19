import { describe, expect, it } from "vitest";
import { predictiveDashboardInternals } from "../src/routes/maintenance-predictive.routes.js";
import type { OperationalTelemetryEnvelope } from "../src/operational-health/types.js";

const observedAt = "2026-09-19T12:00:00.000Z";

function telemetry(
  deviceType: OperationalTelemetryEnvelope["deviceType"],
  deviceId: string,
  metrics: OperationalTelemetryEnvelope["metrics"],
): OperationalTelemetryEnvelope {
  return {
    tenantId: "tenant-a",
    branchId: "branch-a",
    edgeAgentId: "edge-a",
    deviceType,
    deviceId,
    observedAt,
    receivedAt: observedAt,
    source: deviceType === "disk" ? "system" : "snmp",
    quality: "verified",
    idempotencyKey: `${deviceType}:${deviceId}`,
    metrics,
    reasonCodes: [],
  };
}

describe("AI prediction dashboard live telemetry mapping", () => {
  it("derives storage exhaustion only from reported capacity and write rate", () => {
    const [volume] = predictiveDashboardInternals.mapStorage([
      telemetry("disk", "disk-1", {
        name: "Recorder disk 1",
        totalBytes: 10_000_000_000_000,
        usedBytes: 8_000_000_000_000,
        freeBytes: 2_000_000_000_000,
        dailyWriteRateBytes: 200_000_000_000,
      }),
    ], new Map());

    expect(volume).toMatchObject({
      id: "disk-1",
      totalTb: 10,
      usedTb: 8,
      dailyIngestGb: 200,
      daysRemaining: 10,
      dataQuality: "verified",
    });
  });

  it("leaves unreported capacity and forecast fields unavailable", () => {
    const [volume] = predictiveDashboardInternals.mapStorage([
      telemetry("disk", "disk-2", { smartStatus: "PASS" }),
    ], new Map());

    expect(volume).toMatchObject({
      totalTb: null,
      usedTb: null,
      dailyIngestGb: null,
      daysRemaining: null,
      smartStatus: "PASS",
    });
  });

  it("maps observed network measurements without inventing device controls", () => {
    const [device] = predictiveDashboardInternals.mapNetwork([
      telemetry("switch", "switch-1", {
        name: "Core switch",
        healthScore: 82,
        packetLossPercent: 1.5,
        temperatureCelsius: 49,
      }),
    ], new Map());

    expect(device).toMatchObject({
      id: "switch-1",
      model: "Core switch",
      linkHealth: 82,
      packetLossPct: 1.5,
      tempC: 49,
      dataQuality: "verified",
    });
    expect(device).not.toHaveProperty("cycled");
  });
});
