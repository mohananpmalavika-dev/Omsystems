import { describe, expect, it } from "vitest";
import { resolveScopedRetentionPolicy } from "../../src/retention/domain/retention-policy.js";
import { RetentionEvidenceService } from "../../src/retention/services/retention-evidence.service.js";
import { RetentionCalculatorService } from "../../src/retention/services/retention-calculator.service.js";
import { verifyContinuousRetention } from "../../src/operational-health/service.js";

describe("retention compliance guards", () => {
  it("ignores policy assignments outside their effective window", () => {
    const now = new Date("2026-09-08T12:00:00.000Z");
    const policy = resolveScopedRetentionPolicy({ tenantId: "tenant", branchId: "branch" }, [{
      id: "future-branch-policy", tenantId: "tenant", scopeType: "BRANCH", scopeId: "branch",
      requiredRetentionDays: 365, effectiveFrom: new Date("2026-10-01T00:00:00.000Z"), priority: 100,
    }], now);
    expect(policy.requiredDays).toBe(90);
  });

  it("rejects future-dated evidence instead of treating it as fresh", () => {
    const service = new RetentionEvidenceService();
    const now = new Date("2026-09-08T12:00:00.000Z");
    const evidence = {
      id: "future", tenantId: "tenant", branchId: "branch", recorderId: "recorder",
      source: "RECORDER_ARCHIVE" as const, quality: "ARCHIVE_CONFIRMED" as const,
      observedAt: new Date("2026-09-08T12:10:01.000Z"), confidence: 0.9,
    };
    expect(service.isEvidenceFresh(evidence, now, 60)).toBe(false);
  });

  it("does not double-count overlapping archive segments", () => {
    const result = new RetentionCalculatorService().calculateCoverage([
      { startTime: new Date("2026-09-08T00:00:00.000Z"), endTime: new Date("2026-09-08T00:40:00.000Z") },
      { startTime: new Date("2026-09-08T00:20:00.000Z"), endTime: new Date("2026-09-08T01:00:00.000Z") },
    ], new Date("2026-09-08T00:00:00.000Z"), new Date("2026-09-08T01:00:00.000Z"), 1);
    expect(result.recordedMinutes).toBe(60);
    expect(result.coveragePercent).toBe(100);
  });

  it("does not accept future-dated recorder archive evidence", () => {
    const now = Date.parse("2026-09-08T12:00:00.000Z");
    const verification = verifyContinuousRetention("camera", [], {
      retentionDays: 30, maxRecordingGapSeconds: 120,
    }, now, {
      recorderId: "recorder", observedAt: new Date(now + 6 * 60_000).toISOString(), sourceChannel: 1,
      status: "available", oldestContinuousAt: new Date(now - 40 * 86_400_000).toISOString(),
      newestPlayableAt: new Date(now).toISOString(), retentionLowerBound: false, coverageComplete: true,
      continuityGapSeconds: 0, playbackVerified: true, playbackFrameDecoded: true, reasonCodes: [],
    });
    expect(verification.status).toBe("unknown");
    expect(verification.reasonCodes).toContain("recorder_archive_evidence_stale");
  });
});
