import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { OfflineEvidenceVerifier } from "../../packages/evidence-verifier/src/evidence-verifier.js";

describe("Offline Evidence Verifier & Durability (P0 Phase 6)", () => {
  const testDir = join(process.cwd(), "tmp", "test-evidence-pkg");

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("verifies authentic forensic package without server connection", async () => {
    const videoData = Buffer.from("dummy-cctv-footage-stream-bytes-1080p");
    const snapshotData = Buffer.from("dummy-snapshot-jpeg-frame");
    const metadataData = Buffer.from(JSON.stringify({ camera: "cam-vault", fps: 25 }));
    const auditData = Buffer.from(JSON.stringify([{ action: "captured", time: new Date().toISOString() }]));

    const videoSha256 = OfflineEvidenceVerifier.computeSha256(videoData);
    const snapshotSha256 = OfflineEvidenceVerifier.computeSha256(snapshotData);

    const manifest = {
      evidenceId: "ev-test-100",
      alertId: "alt-p1-vault",
      branchId: "branch-delhi-01",
      cameraId: "cam-vault-01",
      signatureBytes: "mock-valid-sig",
      video: {
        sha256: videoSha256,
        sizeBytes: videoData.length,
      },
      snapshot: {
        sha256: snapshotSha256,
        sizeBytes: snapshotData.length,
      },
      custodyHistory: [
        { sequence: 1, action: "CAPTURED", sha256: videoSha256 },
        { sequence: 2, action: "SEALED", prevHash: videoSha256, sha256: "hash-2" },
      ],
    };

    await fs.writeFile(join(testDir, "footage.mp4"), videoData);
    await fs.writeFile(join(testDir, "snapshot.jpg"), snapshotData);
    await fs.writeFile(join(testDir, "metadata.json"), metadataData);
    await fs.writeFile(join(testDir, "audit.json"), auditData);
    await fs.writeFile(join(testDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    const result = await OfflineEvidenceVerifier.verifyPackage(testDir);
    expect(result.valid).toBe(true);
    expect(result.integrityStatus).toBe("VERIFIED");
    expect(result.checks.assetsVerified["footage.mp4"].match).toBe(true);
    expect(result.checks.assetsVerified["snapshot.jpg"].match).toBe(true);
    expect(result.checks.chainOfCustodyValid).toBe(true);
  });

  it("detects tampered video footage and marks integrityStatus TAMPERED", async () => {
    const videoData = Buffer.from("authentic-original-footage");
    const tamperedVideoData = Buffer.from("tampered-altered-footage-by-malicious-actor");
    const snapshotData = Buffer.from("snapshot-frame");
    const metadataData = Buffer.from(JSON.stringify({ test: true }));
    const auditData = Buffer.from(JSON.stringify([]));

    const originalSha256 = OfflineEvidenceVerifier.computeSha256(videoData);

    const manifest = {
      evidenceId: "ev-test-200",
      signatureBytes: "sig",
      video: {
        sha256: originalSha256,
      },
      snapshot: {
        sha256: OfflineEvidenceVerifier.computeSha256(snapshotData),
      },
    };

    // Write tampered footage instead of original
    await fs.writeFile(join(testDir, "footage.mp4"), tamperedVideoData);
    await fs.writeFile(join(testDir, "snapshot.jpg"), snapshotData);
    await fs.writeFile(join(testDir, "metadata.json"), metadataData);
    await fs.writeFile(join(testDir, "audit.json"), auditData);
    await fs.writeFile(join(testDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    const result = await OfflineEvidenceVerifier.verifyPackage(testDir);
    expect(result.valid).toBe(false);
    expect(result.integrityStatus).toBe("TAMPERED");
    expect(result.checks.assetsVerified["footage.mp4"].match).toBe(false);
    expect(result.errors.some((e) => e.includes("SHA-256 mismatch"))).toBe(true);
  });
});
