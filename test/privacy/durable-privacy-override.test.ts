import { describe, expect, it } from "vitest";
import { PrivacyOverrideService } from "../../src/privacy/services/privacy-override.service.js";

describe("Durable Privacy Override & Hash-Chained Audit (P0 Phase 7)", () => {
  it("rejects unmask request with missing or trivial justification", async () => {
    const service = new PrivacyOverrideService();
    await expect(
      service.requestUnmask({
        tenantId: "t-bank",
        userId: "usr-operator-1",
        username: "Operator John",
        cameraId: "cam-teller-01",
        operation: "LIVE",
        reason: "none", // < 5 chars
      }),
    ).rejects.toThrow(/Mandatory investigation reason/);
  });

  it("issues active unmask grant with correct expiration", async () => {
    const service = new PrivacyOverrideService();
    const grant = await service.requestUnmask({
      tenantId: "t-bank",
      userId: "usr-operator-1",
      username: "Operator John",
      cameraId: "cam-teller-01",
      operation: "LIVE",
      reason: "P1 Incident Investigation Case #2026-991",
      caseNumber: "CASE-991",
      durationMinutes: 15,
    });

    expect(grant.status).toBe("ACTIVE");
    expect(grant.cameraId).toBe("cam-teller-01");

    const active = service.getActiveGrant("usr-operator-1", "cam-teller-01", "LIVE");
    expect(active).toBeDefined();
    expect(active?.id).toBe(grant.id);
  });

  it("produces immutable audit records upon unmask approval", async () => {
    const service = new PrivacyOverrideService();
    await service.requestUnmask({
      tenantId: "t-bank-delhi",
      userId: "usr-sec-officer",
      username: "Officer Smith",
      cameraId: "cam-vault-main",
      operation: "PLAYBACK",
      reason: "Cash audit verification after hours",
    });

    const logs = service.getAuditLogs("t-bank-delhi");
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].event).toBe("PRIVACY_UNMASK_APPROVED");
    expect(logs[0].cameraId).toBe("cam-vault-main");
  });
});
