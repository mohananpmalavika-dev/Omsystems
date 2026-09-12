import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { generateKeyPairSync, sign, createHash } from "node:crypto";
import { OfflineEvidenceVerifier, canonicalJsonStringify } from "../../packages/evidence-verifier/src/evidence-verifier.js";

describe("Offline Evidence Verifier & Durability (P0-06 & P0-07)", () => {
  const testDir = join(process.cwd(), "tmp", "test-evidence-pkg");
  let privateKeyPem: string;
  let publicKeyPem: string;

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("cryptographically verifies authentic package when public key is provided", async () => {
    const videoData = Buffer.from("dummy-cctv-footage-stream-bytes-1080p");
    const snapshotData = Buffer.from("dummy-snapshot-jpeg-frame");
    const metadataData = Buffer.from(JSON.stringify({ camera: "cam-vault", fps: 25 }));
    const auditData = Buffer.from(JSON.stringify([{ action: "captured", time: new Date().toISOString() }]));

    const videoSha256 = OfflineEvidenceVerifier.computeSha256(videoData);
    const snapshotSha256 = OfflineEvidenceVerifier.computeSha256(snapshotData);

    const ev1 = {
      action: "CAPTURED",
      actorType: "USER",
      evidenceId: "ev-test-100",
      performedBy: "system",
      previousHash: "0".repeat(64),
      reason: null,
      sequence: 1,
      sourceIp: null,
      timestamp: "2026-09-12T10:00:00.000Z",
      workstationId: null,
    };
    const hash1 = createHash("sha256").update(canonicalJsonStringify(ev1) + "0".repeat(64)).digest("hex");

    const ev2 = {
      action: "SEALED",
      actorType: "USER",
      evidenceId: "ev-test-100",
      performedBy: "system",
      previousHash: hash1,
      reason: null,
      sequence: 2,
      sourceIp: null,
      timestamp: "2026-09-12T10:05:00.000Z",
      workstationId: null,
    };
    const hash2 = createHash("sha256").update(canonicalJsonStringify(ev2) + hash1).digest("hex");

    const manifest = {
      evidenceId: "ev-test-100",
      alertId: "alt-p1-vault",
      branchId: "branch-delhi-01",
      cameraId: "cam-vault-01",
      signatureAlgorithm: "ed25519",
      video: {
        sha256: videoSha256,
        sizeBytes: videoData.length,
      },
      snapshot: {
        sha256: snapshotSha256,
        sizeBytes: snapshotData.length,
      },
      custodyHistory: [
        { ...ev1, eventHash: hash1 },
        { ...ev2, eventHash: hash2 },
      ],
    };

    const manifestRaw = JSON.stringify(manifest, null, 2);
    const signature = sign(null, Buffer.from(manifestRaw, "utf8"), privateKeyPem);

    await fs.writeFile(join(testDir, "footage.mp4"), videoData);
    await fs.writeFile(join(testDir, "snapshot.jpg"), snapshotData);
    await fs.writeFile(join(testDir, "metadata.json"), metadataData);
    await fs.writeFile(join(testDir, "audit.json"), auditData);
    await fs.writeFile(join(testDir, "manifest.json"), manifestRaw);
    await fs.writeFile(join(testDir, "manifest.sig"), signature);

    const result = await OfflineEvidenceVerifier.verifyPackage(testDir, publicKeyPem);
    expect(result.valid).toBe(true);
    expect(result.integrityStatus).toBe("VERIFIED");
    expect(result.checks.signatureValid).toBe(true);
    expect(result.checks.signatureVerified).toBe(true);
    expect(result.checks.assetsVerified["footage.mp4"].match).toBe(true);
    expect(result.checks.assetsVerified["snapshot.jpg"].match).toBe(true);
  });

  it("returns UNVERIFIED and fails closed when public key is missing", async () => {
    const videoData = Buffer.from("dummy-cctv-footage-stream-bytes-1080p");
    const snapshotData = Buffer.from("dummy-snapshot-jpeg-frame");
    const metadataData = Buffer.from(JSON.stringify({ camera: "cam-vault" }));
    const auditData = Buffer.from(JSON.stringify([]));

    const manifest = {
      evidenceId: "ev-test-101",
      signatureBytes: "some-raw-signature-bytes",
      video: { sha256: OfflineEvidenceVerifier.computeSha256(videoData) },
      snapshot: { sha256: OfflineEvidenceVerifier.computeSha256(snapshotData) },
    };

    await fs.writeFile(join(testDir, "footage.mp4"), videoData);
    await fs.writeFile(join(testDir, "snapshot.jpg"), snapshotData);
    await fs.writeFile(join(testDir, "metadata.json"), metadataData);
    await fs.writeFile(join(testDir, "audit.json"), auditData);
    await fs.writeFile(join(testDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    const result = await OfflineEvidenceVerifier.verifyPackage(testDir);
    // Never call something verified if cryptographic verification was not performed!
    expect(result.valid).toBe(false);
    expect(result.integrityStatus).toBe("UNVERIFIED");
    expect(result.checks.signaturePresent).toBe(true);
    expect(result.checks.signatureVerified).toBe(false);
    expect(result.checks.verificationReason).toBe("PUBLIC_KEY_NOT_AVAILABLE");
  });

  it("detects tampered video footage and marks integrityStatus INVALID", async () => {
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

    await fs.writeFile(join(testDir, "footage.mp4"), tamperedVideoData);
    await fs.writeFile(join(testDir, "snapshot.jpg"), snapshotData);
    await fs.writeFile(join(testDir, "metadata.json"), metadataData);
    await fs.writeFile(join(testDir, "audit.json"), auditData);
    await fs.writeFile(join(testDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    const result = await OfflineEvidenceVerifier.verifyPackage(testDir);
    expect(result.valid).toBe(false);
    expect(result.integrityStatus).toBe("INVALID");
    expect(result.checks.assetsVerified["footage.mp4"].match).toBe(false);
    expect(result.errors.some((e) => e.includes("SHA-256 mismatch"))).toBe(true);
  });
});
