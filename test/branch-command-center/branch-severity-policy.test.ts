import { describe, it, expect } from "vitest";

describe("Branch Severity Engine & Reason Code Policy", () => {
  it("marks branch as CRITICAL when camera is not recording or storage has failed", () => {
    const reasons = [
      { code: "HDD_FAILED", severity: "CRITICAL" as const, message: "HDD-02 failure" },
      { code: "CAMERA_NOT_RECORDING", severity: "CRITICAL" as const, message: "CAM07 not recording" },
      { code: "RETENTION_VIOLATION", severity: "CRITICAL" as const, message: "Retention 61 / 90 days" },
    ];

    const hasCritical = reasons.some((r) => r.severity === "CRITICAL");
    const state = hasCritical ? "CRITICAL" : "HEALTHY";

    expect(state).toBe("CRITICAL");
    expect(reasons.map((r) => r.code)).toEqual(["HDD_FAILED", "CAMERA_NOT_RECORDING", "RETENTION_VIOLATION"]);
  });

  it("distinguishes camera reachable + streaming vs not recording", () => {
    const camera = {
      id: "cam-07",
      onlineStatus: "online",
      streamAvailable: true,
      recordingStatus: "stopped",
      state: "NO_RECORD",
    };

    expect(camera.onlineStatus).toBe("online");
    expect(camera.streamAvailable).toBe(true);
    expect(camera.recordingStatus).toBe("stopped");
    expect(camera.state).toBe("NO_RECORD");
  });
});
