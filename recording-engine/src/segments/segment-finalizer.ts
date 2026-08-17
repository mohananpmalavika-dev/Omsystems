import { open, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { SegmentChecksum } from "./segment-checksum.js";
import { KeyframeIndexer } from "./keyframe-indexer.js";
import { SegmentValidator, type ValidationResult } from "./segment-validator.js";
import {
  createSegmentManifest,
  type SegmentManifest,
} from "../manifest/segment-manifest.js";
import type { ActiveSegment } from "./segment-writer.js";

export interface FinalizationContext {
  tenantId: string;
  branchId: string;
  cameraId: string;
  streamId?: string;
  jobId: string;
  storageNode: string;
  storageRelativePath: string;
  sourceStart?: Date;
  clockOffsetMs?: number;
}

export interface FinalizedSegmentResult {
  success: boolean;
  manifest?: SegmentManifest;
  finalPath: string;
  manifestPath: string;
  sha256?: string;
  validation: ValidationResult;
  error?: string;
}

export class SegmentFinalizer {
  private readonly validator: SegmentValidator;

  constructor(validator: SegmentValidator = new SegmentValidator()) {
    this.validator = validator;
  }

  /**
   * Performs deterministic, crash-safe segment finalization:
   * 1. Fsync media file
   * 2. Validate container
   * 3. Compute SHA-256 hash
   * 4. Extract Keyframe Index
   * 5. Write and fsync sidecar JSON manifest
   * 6. Atomic rename: [segmentId].mkv.partial -> [segmentId].mkv
   */
  async finalize(
    activeSegment: ActiveSegment,
    context: FinalizationContext,
    endTime: Date = new Date(),
  ): Promise<FinalizedSegmentResult> {
    const partialPath = activeSegment.stagingPartialPath;
    const finalPath = activeSegment.targetFinalPath;
    const manifestPath = activeSegment.manifestPath;

    try {
      // Step 1: Ensure directory exists & fsync the media file
      await mkdir(dirname(finalPath), { recursive: true });
      try {
        const fileHandle = await open(partialPath, "r+");
        await fileHandle.sync();
        await fileHandle.close();
      } catch (err) {
        // If file doesn't exist yet, finalization cannot proceed
        return {
          success: false,
          finalPath,
          manifestPath,
          validation: { valid: false, reason: `file_open_failed: ${err instanceof Error ? err.message : String(err)}` },
          error: "media_file_unreachable",
        };
      }

      // Step 2: Validate container integrity
      const validation = await this.validator.validate(partialPath);
      if (!validation.valid) {
        return {
          success: false,
          finalPath,
          manifestPath,
          validation,
          error: `validation_failed: ${validation.reason}`,
        };
      }

      // Step 3: Compute streaming SHA-256 checksum
      const sha256 = await SegmentChecksum.computeSha256(partialPath);

      // Step 4: Extract Keyframe Index & Timing metadata
      const durationSeconds = validation.durationSeconds ??
        Math.max(1, (endTime.getTime() - activeSegment.startTime.getTime()) / 1000);

      const keyframeResult = await KeyframeIndexer.extractKeyframeIndex(
        partialPath,
        activeSegment.startTime,
        durationSeconds,
      );

      const fileStats = await stat(partialPath);
      const durationMs = keyframeResult.durationMs ?? Math.floor(durationSeconds * 1000);

      // Step 5: Construct Sidecar Manifest
      const manifest = createSegmentManifest({
        segmentId: activeSegment.segmentId,
        tenantId: context.tenantId,
        branchId: context.branchId,
        cameraId: context.cameraId,
        streamId: context.streamId ?? "main",
        jobId: context.jobId,
        storageNode: context.storageNode,
        storagePath: context.storageRelativePath,
        mediaFormat: activeSegment.containerFormat,
        systemStart: activeSegment.startTime.toISOString(),
        systemEnd: endTime.toISOString(),
        sourceStart: context.sourceStart?.toISOString() ?? activeSegment.startTime.toISOString(),
        sourceEnd: new Date((context.sourceStart?.getTime() ?? activeSegment.startTime.getTime()) + durationMs).toISOString(),
        clockOffsetMs: context.clockOffsetMs ?? 0,
        firstPts: keyframeResult.firstPts,
        lastPts: keyframeResult.lastPts,
        firstDts: keyframeResult.firstDts,
        lastDts: keyframeResult.lastDts,
        codec: validation.codec ?? "h264",
        width: validation.width,
        height: validation.height,
        fps: validation.fps ?? 25,
        durationMs,
        sizeBytes: fileStats.size,
        sha256,
        keyframeCount: keyframeResult.keyframes.length,
        keyframes: keyframeResult.keyframes,
        state: "AVAILABLE",
        health: "HEALTHY",
        finalizedAt: new Date().toISOString(),
      });

      // Step 6: Write & fsync sidecar manifest
      const manifestHandle = await open(`${manifestPath}.tmp`, "w");
      await manifestHandle.writeFile(JSON.stringify(manifest, null, 2), "utf8");
      await manifestHandle.sync();
      await manifestHandle.close();
      await rename(`${manifestPath}.tmp`, manifestPath);

      // Step 7: Atomic rename partial media file to final media file
      await rename(partialPath, finalPath);

      return {
        success: true,
        manifest,
        finalPath,
        manifestPath,
        sha256,
        validation,
      };
    } catch (error) {
      return {
        success: false,
        finalPath,
        manifestPath,
        validation: { valid: false, reason: `finalization_exception: ${error instanceof Error ? error.message : String(error)}` },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
