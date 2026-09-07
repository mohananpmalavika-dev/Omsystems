import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LegalHoldService } from "../../src/evidence/services/legal-hold.service.js";
import { RetentionEngineService } from "../../src/retention/services/retention-engine.service.js";
import { LegalHoldStatusUnknownError, EvidenceRepository } from "../../src/database/evidence-repository.js";

describe("Legal Hold Fail-Closed Subsystem (P0-04, P0-05)", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it("throws 503 LEGAL_HOLD_AUTHORITY_UNAVAILABLE when database is unavailable in production for create and release", async () => {
    process.env.NODE_ENV = "production";

    // Service with no pool and no repository
    const service = new LegalHoldService();

    // 1. Create Legal Hold must NEVER fabricate success from memory; must fail closed with 503
    await expect(
      service.createLegalHold({
        tenantId: "TENANT-BANK-01",
        caseNumber: "CASE-LEGAL-2026-991",
        reason: "CBI / High Court preservation order",
        requestedBy: "compliance-officer",
        cameraIds: ["CAM-VAULT-01"],
        startTime: "2026-09-01T00:00:00Z",
        endTime: "2026-09-07T00:00:00Z",
      }),
    ).rejects.toThrow("LEGAL_HOLD_AUTHORITY_UNAVAILABLE");

    // 2. Release Legal Hold must NEVER fabricate release from memory; must fail closed with 503
    await expect(
      service.releaseLegalHold("hold-arbitrary-uuid", "compliance-officer", "Case settled"),
    ).rejects.toThrow("LEGAL_HOLD_AUTHORITY_UNAVAILABLE");
  });

  it("isProtectedAsync fails closed (throws LegalHoldStatusUnknownError) when legal hold authority cannot be queried in production", async () => {
    process.env.NODE_ENV = "production";

    const service = new LegalHoldService();

    // Must NOT return { protected: false }; must throw LegalHoldStatusUnknownError
    await expect(
      service.isProtectedAsync({
        cameraId: "CAM-VAULT-01",
        timestamp: new Date("2026-09-05T12:00:00Z"),
        tenantId: "TENANT-BANK-01",
      }),
    ).rejects.toThrow(LegalHoldStatusUnknownError);
  });

  it("RetentionEngine.executeAuditedDeletion fails closed immediately when legal hold query fails or DB is unavailable", async () => {
    process.env.NODE_ENV = "production";

    let backendDeleteInvoked = false;
    const backendDeleteFn = async () => {
      backendDeleteInvoked = true;
    };

    // Construct mock evidence repo that fails or times out
    const failingRepo = {
      isSegmentProtected: async () => {
        throw new Error("PostgreSQL connection timeout: pool exhausted");
      },
    } as unknown as EvidenceRepository;

    const engine = new RetentionEngineService(failingRepo);

    // Destructive deletion MUST fail closed when status is UNKNOWN
    await expect(
      engine.executeAuditedDeletion({
        segmentId: "seg-target-001",
        cameraId: "CAM-VAULT-01",
        branchId: "BR-DELHI-01",
        tenantId: "TENANT-BANK-01",
        storageLocator: "/vault/seg-target-001.mp4",
        sizeBytes: 15_000_000,
        sha256: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
        backendDeleteFn,
        actor: "retention-pruning-worker",
        reason: "Storage pressure policy purge",
        segmentStartTime: new Date("2026-06-01T00:00:00Z"),
      }),
    ).rejects.toThrow(/Legal hold status unknown.*fail-closed/);

    // Physical delete MUST NOT have been called!
    expect(backendDeleteInvoked).toBe(false);
  });

  it("RetentionEngine.executeAuditedDeletion allows deletion ONLY when authoritative repository confirms NOT protected", async () => {
    process.env.NODE_ENV = "production";

    let backendDeleteInvoked = false;
    const backendDeleteFn = async () => {
      backendDeleteInvoked = true;
    };

    // Authoritative repository returns protected: false
    const clearRepo = {
      isSegmentProtected: async () => ({
        protected: false,
      }),
    } as unknown as EvidenceRepository;

    const engine = new RetentionEngineService(clearRepo);

    const result = await engine.executeAuditedDeletion({
      segmentId: "seg-target-002",
      cameraId: "CAM-LOBBY-01",
      branchId: "BR-DELHI-01",
      tenantId: "TENANT-BANK-01",
      storageLocator: "/vault/seg-target-002.mp4",
      sizeBytes: 8_000_000,
      sha256: "b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1",
      backendDeleteFn,
      actor: "retention-pruning-worker",
      reason: "Storage pressure policy purge",
      segmentStartTime: new Date("2026-05-01T00:00:00Z"),
    });

    expect(backendDeleteInvoked).toBe(true);
    expect(result.success).toBe(true);
    expect(result.auditId).toBeDefined();
  });

  it("RetentionEngine.executeAuditedDeletion explicitly blocks deletion when authoritative repository confirms protected", async () => {
    process.env.NODE_ENV = "production";

    let backendDeleteInvoked = false;
    const backendDeleteFn = async () => {
      backendDeleteInvoked = true;
    };

    const heldRepo = {
      isSegmentProtected: async () => ({
        protected: true,
        reason: "Active regulatory legal hold HOLD-2026-004",
        hold: { id: "HOLD-2026-004" },
      }),
    } as unknown as EvidenceRepository;

    const engine = new RetentionEngineService(heldRepo);

    await expect(
      engine.executeAuditedDeletion({
        segmentId: "seg-target-003",
        cameraId: "CAM-VAULT-01",
        branchId: "BR-DELHI-01",
        tenantId: "TENANT-BANK-01",
        storageLocator: "/vault/seg-target-003.mp4",
        sizeBytes: 12_000_000,
        sha256: "c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2",
        backendDeleteFn,
        actor: "retention-pruning-worker",
        reason: "Storage pressure policy purge",
        segmentStartTime: new Date("2026-05-01T00:00:00Z"),
      }),
    ).rejects.toThrow(/Cannot delete segment 'seg-target-003': Active regulatory legal hold/);

    expect(backendDeleteInvoked).toBe(false);
  });
});
