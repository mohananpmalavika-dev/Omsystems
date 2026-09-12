import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  OfflineEvidencePlayer,
  type OfflineEvidenceManifest,
} from "../../packages/offline-player/src/offline-player.js";

describe("Offline Evidence Player & Standalone Forensic Viewer (Phase 35)", () => {
  const dummyFile1 = Buffer.from("VIDEO_STREAM_DATA_FOR_CAM1_VAULT");
  const dummyFile2 = Buffer.from("VIDEO_STREAM_DATA_FOR_CAM2_ENTRANCE");

  const hash1 = createHash("sha256").update(dummyFile1).digest("hex");
  const hash2 = createHash("sha256").update(dummyFile2).digest("hex");

  const manifest: OfflineEvidenceManifest = {
    manifestVersion: "1.0.0",
    packageId: "KVE-PKG-20260912-001",
    incidentId: "INC-VAULT-BREACH-09",
    tenantId: "bank-alpha",
    branchId: "BR-088",
    exportTimestamp: "2026-09-12T10:00:00.000Z",
    assets: [
      {
        assetId: "asset-1",
        cameraId: "CAM-01",
        cameraName: "Vault Interior",
        filename: "cam01_vault.mp4",
        sha256Hash: hash1,
        durationSeconds: 120,
        fps: 25,
        width: 1920,
        height: 1080,
      },
      {
        assetId: "asset-2",
        cameraId: "CAM-02",
        cameraName: "Vault Airlock",
        filename: "cam02_airlock.mp4",
        sha256Hash: hash2,
        durationSeconds: 120,
        fps: 25,
        width: 1920,
        height: 1080,
      },
    ],
    chainOfCustody: [
      {
        step: 1,
        actor: "SYSTEM_RECORDER",
        action: "RECORDED",
        timestamp: "2026-09-12T10:00:00.000Z",
        prevHash: "GENESIS",
        recordHash: createHash("sha256")
          .update("GENESIS:1:SYSTEM_RECORDER:RECORDED:2026-09-12T10:00:00.000Z")
          .digest("hex"),
      },
      {
        step: 2,
        actor: "FORENSIC_OFFICER_J_DOE",
        action: "SEALED",
        timestamp: "2026-09-12T10:05:00.000Z",
        prevHash: createHash("sha256")
          .update("GENESIS:1:SYSTEM_RECORDER:RECORDED:2026-09-12T10:00:00.000Z")
          .digest("hex"),
        recordHash: createHash("sha256")
          .update(
            `${createHash("sha256").update("GENESIS:1:SYSTEM_RECORDER:RECORDED:2026-09-12T10:00:00.000Z").digest("hex")}:2:FORENSIC_OFFICER_J_DOE:SEALED:2026-09-12T10:05:00.000Z`
          )
          .digest("hex"),
      },
    ],
    manifestSignature: "sig-rsa-sha256-production-cert",
  };

  it("verifies package integrity and confirms untampered cryptographic seals", () => {
    const player = new OfflineEvidencePlayer(manifest);
    const files = new Map<string, Buffer>();
    files.set("cam01_vault.mp4", dummyFile1);
    files.set("cam02_airlock.mp4", dummyFile2);

    const report = player.verifyPackageIntegrity(files);

    expect(report.overallValid).toBe(true);
    expect(report.tamperDetected).toBe(false);
    expect(report.custodyChainValid).toBe(true);
    expect(report.assetIntegrityResults.length).toBe(2);
    expect(report.assetIntegrityResults[0]?.valid).toBe(true);
    expect(report.assetIntegrityResults[1]?.valid).toBe(true);
  });

  it("detects asset tampering when media content is modified", () => {
    const player = new OfflineEvidencePlayer(manifest);
    const files = new Map<string, Buffer>();
    files.set("cam01_vault.mp4", dummyFile1);
    files.set("cam02_airlock.mp4", Buffer.from("CORRUPTED_OR_TAMPERED_MEDIA_DATA")); // Tampered!

    const report = player.verifyPackageIntegrity(files);

    expect(report.overallValid).toBe(false);
    expect(report.tamperDetected).toBe(true);
    expect(report.assetIntegrityResults[1]?.valid).toBe(false);
  });

  it("synchronizes multi-camera timeline playback seeking across tracks", () => {
    const player = new OfflineEvidencePlayer(manifest);

    const playbackState = player.seekToOffset(30.0, 1.0); // seek to 30s
    expect(playbackState.currentOffsetSeconds).toBe(30);
    expect(playbackState.cameraTracks.length).toBe(2);

    const cam1Track = playbackState.cameraTracks[0];
    expect(cam1Track?.cameraId).toBe("CAM-01");
    expect(cam1Track?.activeFrameNumber).toBe(750); // 30s * 25fps = frame 750

    const cert = player.generateForensicCertificate("Court Examiner J. Smith", {
      packageId: manifest.packageId,
      overallValid: true,
      assetIntegrityResults: [
        { assetId: "asset-1", filename: "cam01_vault.mp4", expectedHash: hash1, calculatedHash: hash1, valid: true },
      ],
      custodyChainValid: true,
      tamperDetected: false,
      verificationTimestamp: new Date().toISOString(),
    });

    expect(cert).toContain("KRYPTOVISION FORENSIC EVIDENCE INTEGRITY CERTIFICATE");
    expect(cert).toContain("COURT ADMISSIBLE");
  });
});
