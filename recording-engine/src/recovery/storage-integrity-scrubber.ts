/**
 * Background Storage Integrity Scrubber
 * 
 * Performs periodic, sampled cryptographic integrity verification across stored recordings.
 */

import type { StorageBackend } from "../backends/storage-backend.interface.js";
import type { CanonicalRecordingIndexRecord } from "../../../packages/contracts/src/storage/storage-types.js";

export interface ScrubbingReport {
  totalSampled: number;
  validCount: number;
  corruptedCount: number;
  corruptedSegments: Array<{
    segmentId: string;
    expectedSha256: string;
    actualSha256?: string;
    error?: string;
  }>;
  durationMs: number;
  completedAt: string;
}

export class StorageIntegrityScrubber {
  constructor(private readonly backend: StorageBackend) {}

  /**
   * Scrubs a sample of records (e.g. sampleRate = 0.1 for 10% sampling)
   */
  async scrubSample(records: CanonicalRecordingIndexRecord[], sampleRate = 0.1): Promise<ScrubbingReport> {
    const startedAt = Date.now();
    const count = Math.max(1, Math.min(records.length, Math.ceil(records.length * sampleRate)));
    const sampled = records.slice(0, count);

    const corrupted: ScrubbingReport["corruptedSegments"] = [];
    let validCount = 0;

    for (const record of sampled) {
      try {
        const verifyResult = await this.backend.verify(record.storageLocator);
        if (!verifyResult.valid || (verifyResult.sha256 && record.sha256.toLowerCase() !== verifyResult.sha256.toLowerCase())) {
          corrupted.push({
            segmentId: record.segmentId,
            expectedSha256: record.sha256,
            actualSha256: verifyResult.sha256,
            error: verifyResult.error || "SHA-256 hash mismatch",
          });
        } else {
          validCount++;
        }
      } catch (err: any) {
        corrupted.push({
          segmentId: record.segmentId,
          expectedSha256: record.sha256,
          error: err?.message || String(err),
        });
      }
    }

    return {
      totalSampled: sampled.length,
      validCount,
      corruptedCount: corrupted.length,
      corruptedSegments: corrupted,
      durationMs: Date.now() - startedAt,
      completedAt: new Date().toISOString(),
    };
  }
}
