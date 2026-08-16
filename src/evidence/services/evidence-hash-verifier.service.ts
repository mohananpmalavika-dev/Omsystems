import { createHash } from "node:crypto";
import type { EvidenceManifest } from "../domain/evidence.types.js";

export interface VerificationResult {
  valid: boolean;
  sha256: string;
  sizeBytes: number;
  durationSeconds?: number | undefined;
  durationCoveragePct: number;
  error?: string | undefined;
}

export class EvidenceHashVerifierService {
  static computeSha256(data: Buffer | string): string {
    return createHash("sha256").update(data).digest("hex");
  }

  static verifyMediaAsset(params: {
    data: Buffer;
    expectedMinSizeBytes?: number;
    expectedMinDurationSeconds?: number;
    actualDurationSeconds?: number;
  }): VerificationResult {
    const sizeBytes = params.data.length;
    const sha256 = this.computeSha256(params.data);

    if (params.expectedMinSizeBytes && sizeBytes < params.expectedMinSizeBytes) {
      return {
        valid: false,
        sha256,
        sizeBytes,
        durationCoveragePct: 0,
        error: `File size ${sizeBytes} bytes is below expected minimum ${params.expectedMinSizeBytes} bytes`,
      };
    }

    const duration = params.actualDurationSeconds ?? 0;
    const minDuration = params.expectedMinDurationSeconds ?? 0;
    const coverage = minDuration > 0 ? Math.min(100, Math.round((duration / minDuration) * 10000) / 100) : 100;

    return {
      valid: coverage >= 90,
      sha256,
      sizeBytes,
      durationSeconds: duration,
      durationCoveragePct: coverage,
    };
  }

  static generateManifest(params: Omit<EvidenceManifest, "manifestSha256">): EvidenceManifest {
    // Canonical JSON representation
    const canonicalObj = {
      evidenceId: params.evidenceId,
      alertId: params.alertId,
      branchId: params.branchId,
      cameraId: params.cameraId,
      detectedAt: params.detectedAt,
      requestedWindow: params.requestedWindow,
      actualWindow: params.actualWindow,
      snapshot: params.snapshot,
      video: params.video,
      source: params.source,
      generatedAt: params.generatedAt,
    };

    const canonicalJson = JSON.stringify(canonicalObj);
    const manifestSha256 = this.computeSha256(canonicalJson);

    return {
      ...canonicalObj,
      manifestSha256,
    };
  }

  static verifyManifest(manifest: EvidenceManifest): boolean {
    const { manifestSha256, ...rest } = manifest;
    const recomputed = this.computeSha256(JSON.stringify(rest));
    return manifestSha256 === recomputed;
  }
}
