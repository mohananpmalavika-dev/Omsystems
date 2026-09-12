import { describe, it, expect } from "vitest";
import { RecordingStartupRecoveryService } from "../../src/recording/services/recording-startup-recovery.service.js";
import { RecordingContinuityLedgerService } from "../../src/recording/services/recording-continuity-ledger.service.js";

describe("Recording Crash Recovery & Continuity Ledgers", () => {
  it("initializes startup recovery scan and handles container validation gracefully", async () => {
    const recoveryService = new RecordingStartupRecoveryService();
    const result = await recoveryService.runStartupRecoveryScan();

    expect(result).toBeDefined();
    expect(result.segmentsScanned).toBe(0); // Without pool in unit test, nominal 0
    expect(result.segmentsRecovered).toBe(0);
    expect(result.gapsReported).toBe(0);
  });

  it("calculates 24h, 7d, and 30d continuity metrics with banking SLA threshold", async () => {
    const continuityService = new RecordingContinuityLedgerService();
    const now = new Date();

    const summary24h = await continuityService.calculateContinuity({
      tenantId: "tenant-bank-01",
      cameraId: "cam-vault-01",
      windowType: "24H",
      now,
    });

    expect(summary24h.expectedSeconds).toBe(86400);
    expect(summary24h.coveragePercent).toBeGreaterThanOrEqual(99.5);
    expect(summary24h.complianceStatus).toBe("COMPLIANT");
    expect(summary24h.slaBreached).toBe(false);

    const summary7d = await continuityService.calculateContinuity({
      tenantId: "tenant-bank-01",
      cameraId: "cam-vault-01",
      windowType: "7D",
      now,
    });

    expect(summary7d.expectedSeconds).toBe(7 * 86400);
  });
});
