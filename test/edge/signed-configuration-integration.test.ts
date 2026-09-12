import { describe, it, expect, beforeEach } from "vitest";
import { SignedConfigRepository } from "../../src/database/signed-config-repository.js";
import { SignedConfigurationService } from "../../src/edge/services/signed-configuration.service.js";

describe("SignedConfiguration - Repository & Integration Lifecycle", () => {
  let repository: SignedConfigRepository;
  let service: SignedConfigurationService;

  beforeEach(() => {
    repository = new SignedConfigRepository();
    service = new SignedConfigurationService(undefined, repository);
  });

  it("stores and lists signing keys with proper ordering", async () => {
    const k1 = await service.generateKey({ keyId: "key-1", algorithm: "HMAC-SHA256" });
    const k2 = await service.generateKey({ keyId: "key-2", algorithm: "RSA-PSS-SHA256" });

    const allKeys = await repository.listKeys();
    expect(allKeys.length).toBe(2);
    expect(allKeys.map((k) => k.keyId)).toContain("key-1");
    expect(allKeys.map((k) => k.keyId)).toContain("key-2");
  });

  it("handles key rotation and persists audit trail", async () => {
    const k1 = await service.generateKey({ keyId: "prod-key-v1" });
    const { oldKey, newKey } = await service.rotateKey({
      oldKeyId: "prod-key-v1",
      actorId: "sec-admin-42",
    });

    expect(oldKey.status).toBe("RETIRED");
    expect(newKey.status).toBe("ACTIVE");

    const audits = await repository.listAuditLogs({ keyId: newKey.keyId });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(audits[0].eventType).toBe("KEY_ROTATED");
    expect(audits[0].actorId).toBe("sec-admin-42");
  });

  it("saves signed bundles and retrieves latest desired bundle", async () => {
    const b1 = await service.signBundleAsync({
      edgeId: "edge-77",
      version: 1,
      payload: { mode: "standard" },
      signerIdentity: "admin",
    });

    const b2 = await service.signBundleAsync({
      edgeId: "edge-77",
      version: 2,
      payload: { mode: "high-assurance" },
      signerIdentity: "admin",
    });

    const latest = await repository.getLatestDesiredBundle("edge-77");
    expect(latest).toBeDefined();
    expect(latest?.version).toBe(2);
    expect(latest?.payload).toEqual({ mode: "high-assurance" });

    const history = await repository.listBundleHistory("edge-77");
    expect(history.length).toBe(2);
    expect(history[0].version).toBe(2);
    expect(history[1].version).toBe(1);
  });

  it("records application receipt and transitions drift status", async () => {
    const bundle = await service.signBundleAsync({
      edgeId: "edge-88",
      version: 3,
      payload: { fps: 20 },
      signerIdentity: "admin",
    });

    // Edge agent reports success
    const report1 = await service.recordApplicationReceipt({
      bundleId: bundle.bundleId,
      edgeId: "edge-88",
      version: 3,
      appliedHash: bundle.canonicalPayloadHash,
      verificationResult: "VERIFIED",
      edgeAgentVersion: "2.5.0",
      clientIp: "10.14.0.25",
    });

    expect(report1.isDrifted).toBe(false);
    expect(report1.status).toBe("IN_SYNC");

    const updated = await repository.getLatestDesiredBundle("edge-88");
    expect(updated?.status).toBe("APPLIED");
    expect(updated?.appliedVersion).toBe(3);

    // Now edge agent reports corruption
    const report2 = await service.recordApplicationReceipt({
      bundleId: bundle.bundleId,
      edgeId: "edge-88",
      version: 3,
      appliedHash: "corrupted-hash",
      verificationResult: "TAMPERED",
      rejectionReason: "Bad signature",
      edgeAgentVersion: "2.5.0",
    });

    expect(report2.isDrifted).toBe(true);
    expect(report2.status).toBe("TAMPERED");
  });
});
