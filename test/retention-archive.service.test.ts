import { describe, expect, it } from "vitest";
import { verifyContinuousRetention } from "../src/operational-health/service.js";

describe("recorder archive retention evidence", () => {
  it("uses a complete fresh archive scan when this platform has not indexed any segments", () => {
    const now = Date.parse("2026-07-28T00:00:00.000Z");
    const verification = verifyContinuousRetention("camera", [], {
      retentionDays: 30, retentionWarningDays: 3, maxRecordingGapSeconds: 120,
    }, now, {
      recorderId: "nvr-main", observedAt: new Date(now).toISOString(), sourceChannel: 1,
      status: "available", oldestContinuousAt: new Date(now - 35 * 86_400_000).toISOString(),
      newestPlayableAt: new Date(now).toISOString(), retentionLowerBound: false,
      coverageComplete: true, continuityGapSeconds: 30, reasonCodes: [],
    });

    expect(verification).toMatchObject({
      status: "compliant", actualDays: 35, dataSource: "recorder_archive",
      archiveVerified: true, archiveRecorderId: "nvr-main", archiveCoverageComplete: true,
    });
  });

  it("does not turn a truncated archive scan into a retention claim", () => {
    const now = Date.parse("2026-07-28T00:00:00.000Z");
    const verification = verifyContinuousRetention("camera", [], {
      retentionDays: 30, maxRecordingGapSeconds: 120,
    }, now, {
      recorderId: "nvr-main", observedAt: new Date(now).toISOString(), sourceChannel: 1,
      status: "available", oldestContinuousAt: new Date(now - 35 * 86_400_000).toISOString(),
      newestPlayableAt: new Date(now).toISOString(), retentionLowerBound: false,
      coverageComplete: false, continuityGapSeconds: 30, reasonCodes: ["hikvision_archive_retention_result_limit"],
    });

    expect(verification.status).toBe("unknown");
    expect(verification.reasonCodes).toContain("recorder_archive_scan_incomplete");
  });
});
