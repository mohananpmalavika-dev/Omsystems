import { describe, expect, it } from "vitest";
import { rankRecorders, recorderTone } from "../components/operational-health/recorder-fleet-model.js";
import type { RecorderHealth } from "../lib/types/operational-health.js";

describe("recorder fleet dashboard model", () => {
  it("ranks offline recorders first and uses red outage styling", () => {
    const ranked = rankRecorders([recorder("online", "B"), recorder("offline", "A"), recorder("degraded", "C")]);
    expect(ranked.map((item) => item.status)).toEqual(["offline", "degraded", "online"]);
    expect(recorderTone("offline")).toContain("red");
  });
});
function recorder(status: RecorderHealth["status"], id: string): RecorderHealth {
  return { id, branchId: "branch", branchName: id, branchCode: id, name: id, deviceType: "nvr", vendor: "vendor", model: "model", serialNumber: null, firmwareVersion: null, ipAddress: null, protocol: "onvif", status, reachable: status !== "offline", latencyMs: 1, uptimeSeconds: null, recordingStatus: "unknown", connectedCameras: null, totalCameras: null, lastCheck: "2026-07-28T00:00:00.000Z", quality: "verified", reasonCodes: [] };
}
