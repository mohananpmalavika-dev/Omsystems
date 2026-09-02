/**
 * Recording Staging Service
 * 
 * Separates local ephemeral media capture from final backend storage commitment.
 */

import { randomUUID } from "node:crypto";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { SegmentChecksum } from "../segments/segment-checksum.js";
import { fsyncDirectory } from "./atomic-write-helper.js";

export interface LocalStagingAllocation {
  stagingId: string;
  cameraId: string;
  segmentId: string;
  stagingDirectory: string;
  partialPath: string;
  allocatedAt: Date;
}

export interface FinalizedSegment {
  stagingId: string;
  cameraId: string;
  segmentId: string;
  localFinalPath: string;
  sizeBytes: number;
  sha256: string;
  finalizedAt: Date;
}

export class RecordingStagingService {
  constructor(private readonly baseStagingRoot: string) {}

  /**
   * Allocate a local staging file for incoming camera recording stream
   */
  async allocate(cameraId: string, segmentId?: string, containerFormat = "mkv"): Promise<LocalStagingAllocation> {
    const stagingId = randomUUID();
    const segId = segmentId || `seg-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const safeCamera = cameraId.replace(/[^a-zA-Z0-9_-]/g, "-");
    const stagingDirectory = join(resolve(this.baseStagingRoot), safeCamera, ".staging");

    await mkdir(stagingDirectory, { recursive: true });

    const partialPath = join(stagingDirectory, `${segId}.${containerFormat}.partial`);

    return {
      stagingId,
      cameraId,
      segmentId: segId,
      stagingDirectory,
      partialPath,
      allocatedAt: new Date(),
    };
  }

  /**
   * Finalize an active staging segment:
   * 1. Validates file existence and non-zero size
   * 2. Calculates canonical SHA-256 checksum
   * 3. Atomically renames .partial to .final
   * 4. Returns verified FinalizedSegment
   */
  async finalize(allocation: LocalStagingAllocation): Promise<FinalizedSegment> {
    const stats = await stat(allocation.partialPath);
    if (!stats.isFile() || stats.size === 0) {
      throw new Error(`Cannot finalize segment: file '${allocation.partialPath}' is empty or does not exist`);
    }

    const sha256 = await SegmentChecksum.computeSha256(allocation.partialPath);
    const finalPath = allocation.partialPath.replace(/\.partial$/, ".final");

    await rename(allocation.partialPath, finalPath);
    await fsyncDirectory(allocation.stagingDirectory).catch(() => undefined);

    return {
      stagingId: allocation.stagingId,
      cameraId: allocation.cameraId,
      segmentId: allocation.segmentId,
      localFinalPath: finalPath,
      sizeBytes: stats.size,
      sha256,
      finalizedAt: new Date(),
    };
  }

  /**
   * Clean up a finalized local staging file after successful commit to backend
   */
  async cleanup(finalizedSegment: FinalizedSegment): Promise<void> {
    await unlink(finalizedSegment.localFinalPath).catch(() => undefined);
  }
}
