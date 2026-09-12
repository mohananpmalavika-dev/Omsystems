import { describe, it, expect } from "vitest";
import { CentralAuditService } from "../../src/audit/services/central-audit.service.js";

describe("Central Immutable Audit Platform & SHA-256 Hash Chaining", () => {
  it("records hash-chained audit records for privileged banking actions", async () => {
    const audit = new CentralAuditService();

    // 1. User login
    const rec1 = await audit.recordAuditEvent({
      tenantId: "bank-alpha",
      actorId: "user-admin",
      actorRole: "SUPER_ADMIN",
      action: "LOGIN",
      resourceType: "SESSION",
      resourceId: "sess-1",
      correlationId: "corr-login-1",
      clientIp: "10.0.0.5",
    });

    expect(rec1.recordHash.length).toBe(64);
    expect(rec1.previousHash).toBe("0000000000000000000000000000000000000000000000000000000000000000");

    // 2. Unmasked video access
    const rec2 = await audit.recordAuditEvent({
      tenantId: "bank-alpha",
      actorId: "user-investigator",
      actorRole: "SOC_L2",
      action: "UNMASKED_VIDEO_ACCESS",
      resourceType: "CAMERA",
      resourceId: "cam-vault-3",
      reason: "Police investigation ref FIR-402",
      correlationId: "corr-unmask-2",
      clientIp: "10.0.0.6",
    });

    // Hash chain verification: rec2.previousHash must match rec1.recordHash
    expect(rec2.previousHash).toBe(rec1.recordHash);
    expect(rec2.recordHash).not.toBe(rec1.recordHash);

    // 3. Evidence export
    const rec3 = await audit.recordAuditEvent({
      tenantId: "bank-alpha",
      actorId: "user-investigator",
      actorRole: "SOC_L2",
      action: "EVIDENCE_EXPORT",
      resourceType: "EVIDENCE_PACKAGE",
      resourceId: "ev-pack-101",
      reason: "Court submission",
      correlationId: "corr-export-3",
    });

    expect(rec3.previousHash).toBe(rec2.recordHash);

    // Verify entire ledger chain
    const verification = await audit.verifyAuditChain("bank-alpha");
    expect(verification.isValid).toBe(true);
    expect(verification.recordsVerified).toBe(3);
  });

  it("detects tampering when an intermediate audit record is modified", async () => {
    const audit = new CentralAuditService();

    await audit.recordAuditEvent({
      tenantId: "bank-alpha",
      actorId: "user-admin",
      action: "LOGIN",
      resourceType: "SESSION",
      resourceId: "sess-1",
      correlationId: "corr-1",
    });

    await audit.recordAuditEvent({
      tenantId: "bank-alpha",
      actorId: "user-admin",
      action: "PERMISSION_CHANGE",
      resourceType: "USER",
      resourceId: "user-2",
      correlationId: "corr-2",
    });

    // Intentionally tamper with in-memory ledger record 1
    (audit as any).memoryLedger[1].action = "CONFIG_CHANGE"; // Tampering!

    const verification = await audit.verifyAuditChain("bank-alpha");
    expect(verification.isValid).toBe(false);
    expect(verification.error).toContain("Tampered hash");
  });
});
