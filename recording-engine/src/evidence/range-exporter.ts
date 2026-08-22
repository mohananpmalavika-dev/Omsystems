import { spawn } from "node:child_process";
import { mkdir, writeFile, unlink, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { SegmentChecksum } from "../segments/segment-checksum.js";

export interface SegmentCoverageItem {
  id: string;
  storagePath: string;
  startedAt: Date;
  endedAt: Date;
  sizeBytes: number;
}

export interface RangeExportRequest {
  cameraId: string;
  fromTime: Date;
  toTime: Date;
  outputPath: string;
  format?: "mp4" | "mkv";
}

export interface RangeExportResult {
  success: boolean;
  outputPath: string;
  sizeBytes: number;
  sha256?: string;
  segmentsUsed: number;
  durationSeconds: number;
  error?: string;
}

export class RangeExporter {
  /**
   * Slices and stitches existing immutable recording segments into a single export container.
   */
  static async exportRange(
    request: RangeExportRequest,
    matchingSegments: SegmentCoverageItem[],
  ): Promise<RangeExportResult> {
    if (matchingSegments.length === 0) {
      return {
        success: false,
        outputPath: request.outputPath,
        sizeBytes: 0,
        segmentsUsed: 0,
        durationSeconds: 0,
        error: "no_matching_segments_for_range",
      };
    }

    await mkdir(dirname(request.outputPath), { recursive: true });

    // Sort segments by startedAt
    const sorted = [...matchingSegments].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

    // Single segment export optimization: direct stream copy / trim
    if (sorted.length === 1 && sorted[0]) {
      const seg = sorted[0];
      const startOffsetSeconds = Math.max(0, (request.fromTime.getTime() - seg.startedAt.getTime()) / 1000);
      const totalDurationSeconds = Math.max(1, (request.toTime.getTime() - request.fromTime.getTime()) / 1000);

      const success = await this.trimSegment(
        seg.storagePath,
        request.outputPath,
        startOffsetSeconds,
        totalDurationSeconds,
      );

      if (success) {
        const stats = await stat(request.outputPath);
        const sha256 = await SegmentChecksum.computeSha256(request.outputPath);
        return {
          success: true,
          outputPath: request.outputPath,
          sizeBytes: stats.size,
          sha256,
          segmentsUsed: 1,
          durationSeconds: totalDurationSeconds,
        };
      }
    }

    // Multi-segment export: Concatenate segments via FFmpeg concat demuxer
    const concatListPath = `${request.outputPath}.concat.txt`;
    const concatContent = sorted.map((s) => `file '${s.storagePath.replaceAll("'", "'\\''")}'`).join("\n");
    await writeFile(concatListPath, concatContent, "utf8");

    try {
      const durationSeconds = (request.toTime.getTime() - request.fromTime.getTime()) / 1000;
      const success = await this.concatSegments(concatListPath, request.outputPath);

      if (!success) {
        return {
          success: false,
          outputPath: request.outputPath,
          sizeBytes: 0,
          segmentsUsed: sorted.length,
          durationSeconds,
          error: "ffmpeg_concat_failed",
        };
      }

      const stats = await stat(request.outputPath);
      const sha256 = await SegmentChecksum.computeSha256(request.outputPath);

      return {
        success: true,
        outputPath: request.outputPath,
        sizeBytes: stats.size,
        sha256,
        segmentsUsed: sorted.length,
        durationSeconds,
      };
    } finally {
      await unlink(concatListPath).catch(() => {});
    }
  }

  private static async trimSegment(
    inputPath: string,
    outputPath: string,
    startOffset: number,
    duration: number,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const args = [
        "-v", "error",
        "-y",
        "-ss", String(startOffset),
        "-i", inputPath,
        "-t", String(duration),
        "-c", "copy",
        outputPath,
      ];

      const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
      child.once("error", () => resolve(false));
      child.once("exit", (code) => resolve(code === 0));
    });
  }

  private static async concatSegments(concatListPath: string, outputPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const args = [
        "-v", "error",
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concatListPath,
        "-c", "copy",
        outputPath,
      ];

      const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
      child.once("error", () => resolve(false));
      child.once("exit", (code) => resolve(code === 0));
    });
  }
}
