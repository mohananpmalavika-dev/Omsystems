import { readFile, stat } from "node:fs/promises";
import { SegmentValidator } from "../segments/segment-validator.js";
import { SegmentChecksum } from "../segments/segment-checksum.js";
import { KeyframeIndexer } from "../segments/keyframe-indexer.js";
import {
  createSegmentManifest,
  segmentManifestSchema,
  type SegmentManifest,
} from "../manifest/segment-manifest.js";

export interface ReconciledSegment {
  mediaPath: string;
  manifestPath: string;
  manifest: SegmentManifest;
  source: "sidecar" | "regenerated";
}

export class OrphanReconciler {
  private readonly validator: SegmentValidator;

  constructor(validator: SegmentValidator = new SegmentValidator()) {
    this.validator = validator;
  }

  /**
   * Reconciles an orphan completed media file by reading its sidecar manifest or generating one.
   */
  async reconcileFile(
    mediaPath: string,
    manifestPath: string,
    fallbackContext: {
      segmentId: string;
      tenantId: string;
      branchId: string;
      cameraId: string;
      jobId: string;
      storageNode: string;
      storageRelativePath: string;
    },
  ): Promise<ReconciledSegment | undefined> {
    // Attempt 1: Read existing sidecar JSON
    try {
      const manifestJson = await readFile(manifestPath, "utf8");
      const parsed = segmentManifestSchema.parse(JSON.parse(manifestJson));
      return {
        mediaPath,
        manifestPath,
        manifest: parsed,
        source: "sidecar",
      };
    } catch {
      // Sidecar missing or invalid, generate fresh manifest
    }

    // Attempt 2: Validate media file and regenerate manifest
    const validation = await this.validator.validate(mediaPath);
    if (!validation.valid) {
      return undefined;
    }

    try {
      const stats = await stat(mediaPath);
      const sha256 = await SegmentChecksum.computeSha256(mediaPath);
      const startTime = stats.birthtime ?? stats.mtime;
      const durationSeconds = validation.durationSeconds ?? 15;
      const endTime = new Date(startTime.getTime() + Math.floor(durationSeconds * 1000));

      const keyframeResult = await KeyframeIndexer.extractKeyframeIndex(
        mediaPath,
        startTime,
        durationSeconds,
      );

      const manifest = createSegmentManifest({
        segmentId: fallbackContext.segmentId,
        tenantId: fallbackContext.tenantId,
        branchId: fallbackContext.branchId,
        cameraId: fallbackContext.cameraId,
        streamId: "main",
        jobId: fallbackContext.jobId,
        storageNode: fallbackContext.storageNode,
        storagePath: fallbackContext.storageRelativePath,
        mediaFormat: mediaPath.endsWith(".mp4") ? "mp4" : "mkv",
        systemStart: startTime.toISOString(),
        systemEnd: endTime.toISOString(),
        durationMs: keyframeResult.durationMs ?? Math.floor(durationSeconds * 1000),
        sizeBytes: stats.size,
        codec: validation.codec ?? "h264",
        width: validation.width,
        height: validation.height,
        fps: validation.fps ?? 25,
        sha256,
        keyframeCount: keyframeResult.keyframes.length,
        keyframes: keyframeResult.keyframes,
        firstPts: keyframeResult.firstPts,
        lastPts: keyframeResult.lastPts,
        state: "AVAILABLE",
        health: "HEALTHY",
      });

      return {
        mediaPath,
        manifestPath,
        manifest,
        source: "regenerated",
      };
    } catch {
      return undefined;
    }
  }
}
