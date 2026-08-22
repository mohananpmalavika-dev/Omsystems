import { describe, expect, it } from "vitest";
import { defaultSeverityForDetection, resolveAlertSeverity } from "../src/analytics/severity-policy.js";

describe("AI alert business severity policy", () => {
  it.each([
    ["person-in-vault-after-hours", "P1"], ["queue-length", "P3"],
    ["fire", "P1"], ["no-helmet", "P2"], ["shoplifting", "P2"],
  ] as const)("maps %s to %s", (type, severity) => {
    expect(defaultSeverityForDetection(type)).toBe(severity);
  });

  it("raises severity for sustained and correlated detections without exceeding P1", () => {
    expect(resolveAlertSeverity({ configuredSeverity: "P4", durationSeconds: 300 })).toBe("P3");
    expect(resolveAlertSeverity({ configuredSeverity: "P4", durationSeconds: 900 })).toBe("P2");
    expect(resolveAlertSeverity({ configuredSeverity: "P3", durationSeconds: 300, correlatedDetectionCount: 2 })).toBe("P1");
    expect(resolveAlertSeverity({ configuredSeverity: "P1", durationSeconds: 900, correlatedDetectionCount: 3 })).toBe("P1");
  });
});
