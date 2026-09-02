/**
 * Startup Segment Recovery Service
 * 
 * Inspects staging folders for orphaned .partial and .tmp files after crashes,
 * recovers valid media, and quarantines corrupted fragments without data loss.
 */

import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { SegmentChecksum } from "../segments/segment-checksum.js";

export interface SegmentRecoverySummary {
  foundPartialCount: number;
  recoveredCount: number;
  finalizedCount: number;
  quarantinedCount: number;
  unrecoverableCount: number;
  items: Array<{
    filePath: string;
    status: "RECOVERED" | "FINALIZED" | "QUARANTINED" | "UNRECOVERABLE";
    sizeBytes: number;
    sha256: string;
    details: string;
  }>;
}

export class SegmentRecoveryService {
  constructor(
    private readonly stagingDirectory: string,
    private readonly quarantineDirectory: string,
  ) {}

  async runStartupRecovery(): Promise<SegmentRecoverySummary> {
    await mkdir(this.stagingDirectory, { recursive: true });
    await mkdir(this.quarantineDirectory, { recursive: true });

    const summary: SegmentRecoverySummary = {
      foundPartialCount: 0,
      recoveredCount: 0,
      finalizedCount: 0,
      quarantinedCount: 0,
      unrecoverableCount: 0,
      items: [],
    };

    let entries: string[] = [];
    try {
      entries = await readdir(this.stagingDirectory);
    } catch {
      return summary;
    }

    for (const entry of entries) {
      if (entry.endsWith(".partial") || entry.includes(".tmp.")) {
        summary.foundPartialCount++;
        const fullPath = join(this.stagingDirectory, entry);

        try {
          const stats = await stat(fullPath);
          if (stats.size === 0) {
            await unlink(fullPath).catch(() => undefined);
            summary.unrecoverableCount++;
            summary.items.push({
              filePath: fullPath,
              status: "UNRECOVERABLE",
              sizeBytes: 0,
              sha256: "",
              details: "Zero-byte abandoned partial file removed",
            });
            continue;
          }

          const sha256 = await SegmentChecksum.computeSha256(fullPath);

          if (stats.size >= 1024) {
            // Valid segment fragment (> 1KB) -> finalize or recover
            const recoveredPath = fullPath.replace(/\.partial$/, ".recovered.mkv");
            await rename(fullPath, recoveredPath);
            summary.recoveredCount++;
            summary.finalizedCount++;
            summary.items.push({
              filePath: recoveredPath,
              status: "FINALIZED",
              sizeBytes: stats.size,
              sha256,
              details: "Recovered valid partial media segment into finalized file",
            });
          } else {
            // Fragment too small (< 1KB) -> quarantine
            const qPath = join(this.quarantineDirectory, `quarantine-${entry}`);
            await rename(fullPath, qPath);
            summary.quarantinedCount++;
            summary.items.push({
              filePath: qPath,
              status: "QUARANTINED",
              sizeBytes: stats.size,
              sha256,
              details: "Truncated fragment moved to quarantine for operator inspection",
            });
          }
        } catch (err: any) {
          summary.unrecoverableCount++;
          summary.items.push({
            filePath: fullPath,
            status: "UNRECOVERABLE",
            sizeBytes: 0,
            sha256: "",
            details: err?.message || String(err),
          });
        }
      }
    }

    return summary;
  }
}
