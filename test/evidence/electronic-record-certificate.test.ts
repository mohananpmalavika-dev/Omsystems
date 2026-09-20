import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { EvidenceSigningProvider } from "../../src/evidence/signing/evidence-signing-provider.js";
import { ElectronicRecordCertificateService } from "../../src/evidence/services/electronic-record-certificate.service.js";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const signingProvider: EvidenceSigningProvider = {
  getKeyId: async () => "test-custody-key",
  getPublicKeyPem: async () => publicKeyPem,
  signDigest: async (digest) => ({ algorithm: "Ed25519", keyId: "test-custody-key", signature: sign(null, digest, privateKey) }),
  verify: async (digest, signature, _keyId, certificatePem) => verify(null, digest, certificatePem || publicKeyPem, signature),
};

const sealedEvidence: any = {
  id: "EV-2026-0001", tenantId: "tenant-a", branchId: "branch-a", cameraId: "camera-a", recorderId: "recorder-a", recorderChannel: 1,
  capturedBy: "operator-a", capturedAt: "2026-09-20T10:00:00.000Z", reason: "incident", status: "SEALED",
  manifestHash: "a".repeat(64), signature: { signature: "package-signature" },
  artifacts: [{ path: "media/clip.mp4", sha256: "b".repeat(64), sizeBytes: 42, mimeType: "video/mp4" }],
};

describe("ElectronicRecordCertificateService", () => {
  it("issues a signed Indian BSA Section 63 certificate only for sealed evidence and named custodian attestation", async () => {
    const service = new ElectronicRecordCertificateService(signingProvider);
    const certificate = await service.issue({
      evidence: sealedEvidence,
      recordDescription: "CCTV recording from branch entrance camera",
      productionMethod: "Exported from the signed recorder playback evidence workflow",
      deviceParticulars: "Recorder A, camera A, branch A",
      custodian: { userId: "custodian-a", name: "System Custodian", designation: "Head of Security", attestedAt: "2026-09-20T11:00:00.000Z" },
      section63Conditions: {
        lawfulControlAndRegularUse: true,
        ordinaryCourseInput: true,
        systemOperatingProperlyOrImpactDisclosed: true,
        outputDerivedInOrdinaryCourse: true,
      },
    });
    expect(certificate.jurisdiction).toBe("IN-BSA-2023-S63");
    expect(await service.verify(certificate)).toBe(true);
  });

  it("does not issue on an unmet statutory condition", async () => {
    const service = new ElectronicRecordCertificateService(signingProvider);
    await expect(service.issue({
      evidence: sealedEvidence,
      recordDescription: "record", productionMethod: "method", deviceParticulars: "device",
      custodian: { userId: "custodian-a", name: "Custodian", designation: "Security", attestedAt: "2026-09-20T11:00:00.000Z" },
      section63Conditions: { lawfulControlAndRegularUse: true, ordinaryCourseInput: false, systemOperatingProperlyOrImpactDisclosed: true, outputDerivedInOrdinaryCourse: true },
    })).rejects.toThrow("Section 63 conditions");
  });
});
