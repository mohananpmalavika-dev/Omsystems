import { createHash } from "node:crypto";

export interface EvidenceAsset {
  assetId: string;
  cameraId: string;
  cameraName: string;
  filename: string;
  sha256Hash: string;
  durationSeconds: number;
  fps: number;
  width: number;
  height: number;
}

export interface CustodyRecord {
  step: number;
  actor: string;
  action: string;
  timestamp: string;
  recordHash: string;
  prevHash: string;
}

export interface OfflineEvidenceManifest {
  manifestVersion: "1.0.0";
  packageId: string;
  incidentId: string;
  tenantId: string;
  branchId: string;
  exportTimestamp: string;
  assets: EvidenceAsset[];
  chainOfCustody: CustodyRecord[];
  manifestSignature: string;
}

export interface VerificationReport {
  packageId: string;
  overallValid: boolean;
  assetIntegrityResults: {
    assetId: string;
    filename: string;
    expectedHash: string;
    calculatedHash: string;
    valid: boolean;
  }[];
  custodyChainValid: boolean;
  tamperDetected: boolean;
  verificationTimestamp: string;
}

export interface PlaybackState {
  currentOffsetSeconds: number;
  isPlaying: boolean;
  playbackRate: number; // 0.25, 0.5, 1, 2, 4, 8, 16
  cameraTracks: {
    cameraId: string;
    cameraName: string;
    activeFrameNumber: number;
    alignedTimestamp: string;
    hasKeyframe: boolean;
  }[];
}

export class OfflineEvidencePlayer {
  constructor(private readonly manifest: OfflineEvidenceManifest) {}

  getManifest(): OfflineEvidenceManifest {
    return this.manifest;
  }

  verifyPackageIntegrity(fileBuffers: Map<string, Buffer>): VerificationReport {
    const assetIntegrityResults: VerificationReport["assetIntegrityResults"] = [];
    let allAssetsValid = true;

    for (const asset of this.manifest.assets) {
      const buffer = fileBuffers.get(asset.filename);
      const calculatedHash = buffer
        ? createHash("sha256").update(buffer).digest("hex")
        : "MISSING_FILE";

      const valid = calculatedHash === asset.sha256Hash;
      if (!valid) {
        allAssetsValid = false;
      }

      assetIntegrityResults.push({
        assetId: asset.assetId,
        filename: asset.filename,
        expectedHash: asset.sha256Hash,
        calculatedHash,
        valid,
      });
    }

    // Verify custody chain
    let custodyChainValid = true;
    for (let i = 0; i < this.manifest.chainOfCustody.length; i++) {
      const current = this.manifest.chainOfCustody[i];
      if (!current) continue;

      if (i > 0) {
        const prev = this.manifest.chainOfCustody[i - 1];
        if (!prev || current.prevHash !== prev.recordHash) {
          custodyChainValid = false;
          break;
        }
      }

      const expectedRecordHash = createHash("sha256")
        .update(`${current.prevHash}:${current.step}:${current.actor}:${current.action}:${current.timestamp}`)
        .digest("hex");

      if (current.recordHash !== expectedRecordHash) {
        custodyChainValid = false;
        break;
      }
    }

    const overallValid = allAssetsValid && custodyChainValid;

    return {
      packageId: this.manifest.packageId,
      overallValid,
      assetIntegrityResults,
      custodyChainValid,
      tamperDetected: !overallValid,
      verificationTimestamp: new Date().toISOString(),
    };
  }

  seekToOffset(offsetSeconds: number, playbackRate = 1.0): PlaybackState {
    const baseExportDate = new Date(this.manifest.exportTimestamp).getTime();

    const cameraTracks = this.manifest.assets.map((asset) => {
      const clampedOffset = Math.min(Math.max(0, offsetSeconds), asset.durationSeconds);
      const activeFrameNumber = Math.floor(clampedOffset * asset.fps);
      const alignedTimestamp = new Date(baseExportDate + clampedOffset * 1000).toISOString();
      const hasKeyframe = activeFrameNumber % Math.round(asset.fps * 2) === 0;

      return {
        cameraId: asset.cameraId,
        cameraName: asset.cameraName,
        activeFrameNumber,
        alignedTimestamp,
        hasKeyframe,
      };
    });

    return {
      currentOffsetSeconds: offsetSeconds,
      isPlaying: false,
      playbackRate,
      cameraTracks,
    };
  }

  generateForensicCertificate(verifierName: string, report: VerificationReport): string {
    return [
      "================================================================================",
      "                KRYPTOVISION FORENSIC EVIDENCE INTEGRITY CERTIFICATE             ",
      "================================================================================",
      `Package ID:      ${report.packageId}`,
      `Incident ID:     ${this.manifest.incidentId}`,
      `Tenant / Branch: ${this.manifest.tenantId} / ${this.manifest.branchId}`,
      `Certified By:    ${verifierName}`,
      `Audit Status:    ${report.overallValid ? "VERIFIED & AUTHENTIC (COURT ADMISSIBLE)" : "FAILED (TAMPER DETECTED)"}`,
      `Verified At:     ${report.verificationTimestamp}`,
      "--------------------------------------------------------------------------------",
      "Asset Cryptographic Seals:",
      ...report.assetIntegrityResults.map(
        (r) => ` - [${r.valid ? "VALID" : "INVALID"}] ${r.filename} (${r.expectedHash.substring(0, 16)}...)`
      ),
      "--------------------------------------------------------------------------------",
      `Chain of Custody Integrity: ${report.custodyChainValid ? "UNBROKEN" : "BROKEN"}`,
      "================================================================================",
    ].join("\n");
  }
}
