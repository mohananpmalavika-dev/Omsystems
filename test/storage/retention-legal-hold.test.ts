import { describe, it, expect, vi, beforeEach } from "vitest";
import { RetentionEngineService } from "../../src/retention/services/retention-engine.service.js";
import { LegalHoldProtectedError } from "../../packages/contracts/src/storage/storage-errors.js";

describe("Retention Engine & Legal Hold Protection", () => {
  let retentionEngine: RetentionEngineService;

  beforeEach(() => {
    retentionEngine = new RetentionEngineService();
  });

  it("strictly blocks physical deletion when segment is under active Legal Hold", async () => {
    // 1. Create active legal hold for camera
    const hold = retentionEngine.createLegalHold({
      tenantId: "BANK-001",
      caseNumber: "CASE-CBI-2026-99",
      reason: "Forensic Investigation",
      createdBy: "officer-sharma",
      scope: {
        branches: ["BR-101"],
        cameras: ["cam-vault-01"],
      },
    });

    const mockBackendDelete = vi.fn().mockResolvedValue(undefined);

    // 2. Attempt deletion on protected camera
    await expect(
      retentionEngine.executeAuditedDeletion({
        segmentId: "seg-vault-888",
        cameraId: "cam-vault-01",
        branchId: "BR-101",
        tenantId: "BANK-001",
        storageLocator: { kind: "FILESYSTEM", path: "/recordings/vault.mkv" },
        sizeBytes: 1048576,
        sha256: "sha256-abc",
        backendDeleteFn: mockBackendDelete,
        actor: "auto-retention-worker",
        reason: "Retention period expired (90d)",
      }),
    ).rejects.toThrow(LegalHoldProtectedError);

    // Assert backend delete was never called
    expect(mockBackendDelete).not.toHaveBeenCalled();
  });

  it("permits physical deletion and generates audit trail when Legal Hold is released", async () => {
    // 1. Create and then release hold
    const hold = retentionEngine.createLegalHold({
      tenantId: "BANK-001",
      caseNumber: "CASE-CLOSED-01",
      reason: "Resolved case",
      createdBy: "officer-sharma",
      scope: {
        cameras: ["cam-lobby-02"],
      },
    });

    retentionEngine.releaseLegalHold(hold.id, "judge-verdict-officer");

    const mockBackendDelete = vi.fn().mockResolvedValue(undefined);

    const result = await retentionEngine.executeAuditedDeletion({
      segmentId: "seg-lobby-777",
      cameraId: "cam-lobby-02",
      branchId: "BR-102",
      tenantId: "BANK-001",
      storageLocator: { kind: "FILESYSTEM", path: "/recordings/lobby.mkv" },
      sizeBytes: 2097152,
      sha256: "sha256-xyz",
      backendDeleteFn: mockBackendDelete,
      actor: "auto-retention-worker",
      reason: "Retention policy execution",
    });

    expect(result.success).toBe(true);
    expect(result.auditId).toBeDefined();
    expect(mockBackendDelete).toHaveBeenCalledTimes(1);
  });
});
