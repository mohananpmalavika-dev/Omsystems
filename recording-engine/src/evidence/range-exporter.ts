import { spawn } from "node:child_process";
import { mkdir, writeFile, unlink, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
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
    const fromMs = request.fromTime.getTime();
    const toMs = request.toTime.getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
      return { success: false, outputPath: request.outputPath, sizeBytes: 0, segmentsUsed: 0, durationSeconds: 0, error: "invalid_export_range" };
    }
    const sorted = matchingSegments.filter((segment) => segment.startedAt.getTime() < toMs && segment.endedAt.getTime() > fromMs)
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    if (sorted.length === 0) {
      return {
        success: false,
        outputPath: request.outputPath,
        sizeBytes: 0,
        segmentsUsed: 0,
        durationSeconds: 0,
        error: "no_matching_segments_for_range",
      };
    }

    // Reject gaps/overlaps rather than silently compressing or duplicating the evidence timeline.
    let coveredUntil = fromMs;
    for (let index = 0; index < sorted.length; index++) {
      const segment = sorted[index]!;
      const start = segment.startedAt.getTime();
      const end = segment.endedAt.getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start > coveredUntil || (index > 0 && start < coveredUntil)) {
        return { success: false, outputPath: request.outputPath, sizeBytes: 0, segmentsUsed: 0, durationSeconds: 0, error: "incomplete_or_overlapping_segment_coverage" };
      }
      coveredUntil = end;
    }
    if (coveredUntil < toMs) return { success: false, outputPath: request.outputPath, sizeBytes: 0, segmentsUsed: 0, durationSeconds: 0, error: "incomplete_segment_coverage" };
    await mkdir(dirname(request.outputPath), { recursive: true });

    // Decode and re-encode so trim boundaries do not leak pre-roll keyframes.
    if (sorted.length === 1 && sorted[0]) {
      const seg = sorted[0];
      const startOffsetSeconds = Math.max(0, (request.fromTime.getTime() - seg.startedAt.getTime()) / 1000);
      const totalDurationSeconds = (toMs - fromMs) / 1000;

      const success = await this.trimSegment(
        seg.storagePath,
        request.outputPath,
        startOffsetSeconds,
        totalDurationSeconds,
      );

      if (success) {
        const actualDuration = await this.probeDuration(request.outputPath);
        if (actualDuration === undefined) return { success: false, outputPath: request.outputPath, sizeBytes: 0, segmentsUsed: 1, durationSeconds: 0, error: "export_duration_unavailable" };
        const stats = await stat(request.outputPath);
        const sha256 = await SegmentChecksum.computeSha256(request.outputPath);
        return {
          success: true,
          outputPath: request.outputPath,
          sizeBytes: stats.size,
          sha256,
          segmentsUsed: 1,
          durationSeconds: actualDuration,
        };
      }
      return { success: false, outputPath: request.outputPath, sizeBytes: 0, segmentsUsed: 1, durationSeconds: 0, error: "ffmpeg_trim_failed" };
    }

    // Multi-segment export: Concatenate segments via FFmpeg concat demuxer
    const concatListPath = `${request.outputPath}.${randomUUID()}.concat.txt`;
    const concatContent = sorted.map((s) => `file '${resolve(s.storagePath).replaceAll("\\", "/").replaceAll("'", "'\\''")}'`).join("\n");
    await writeFile(concatListPath, concatContent, "utf8");

    try {
      const durationSeconds = (request.toTime.getTime() - request.fromTime.getTime()) / 1000;
      const offsetSeconds = (fromMs - sorted[0]!.startedAt.getTime()) / 1000;
      const success = await this.concatSegments(concatListPath, request.outputPath, offsetSeconds, durationSeconds);

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
      const actualDuration = await this.probeDuration(request.outputPath);
      if (actualDuration === undefined) return { success: false, outputPath: request.outputPath, sizeBytes: 0, segmentsUsed: sorted.length, durationSeconds: 0, error: "export_duration_unavailable" };

      const stats = await stat(request.outputPath);
      const sha256 = await SegmentChecksum.computeSha256(request.outputPath);

      return {
        success: true,
        outputPath: request.outputPath,
        sizeBytes: stats.size,
        sha256,
        segmentsUsed: sorted.length,
        durationSeconds: actualDuration,
      };
    } finally {
      try {
        await unlink(concatListPath);
      } catch {
        // temporary concat list file was already cleaned up
      }
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
        "-i", inputPath,
        "-ss", String(startOffset),
        "-t", String(duration),
        "-c:v", this.videoEncoder(), "-c:a", "aac",
        outputPath,
      ];

      const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
      child.once("error", () => resolve(false));
      child.stdout?.resume(); child.stderr?.resume();
      child.once("close", (code) => resolve(code === 0));
    });
  }

  private static async concatSegments(concatListPath: string, outputPath: string, offsetSeconds: number, durationSeconds: number): Promise<boolean> {
    return new Promise((resolve) => {
      const args = [
        "-v", "error",
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concatListPath,
        "-ss", String(offsetSeconds),
        "-t", String(durationSeconds),
        "-c:v", this.videoEncoder(), "-c:a", "aac",
        outputPath,
      ];

      const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
      child.once("error", () => resolve(false));
      child.stdout?.resume(); child.stderr?.resume();
      child.once("close", (code) => resolve(code === 0));
    });
  }

  private static async probeDuration(outputPath: string): Promise<number | undefined> {
    return new Promise((resolveDuration) => {
      const child = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", outputPath], { stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      child.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
      child.stderr?.resume();
      child.once("error", () => resolveDuration(undefined));
      child.once("close", (code) => {
        try {
          const duration = Number(JSON.parse(output).format?.duration);
          resolveDuration(code === 0 && Number.isFinite(duration) && duration > 0 ? duration : undefined);
        } catch { resolveDuration(undefined); }
      });
    });
  }

  private static videoEncoder(): string {
    // The bundled Windows FFmpeg is LGPL and supplies OpenH264 rather than x264.
    return process.env.RECORDING_EXPORT_VIDEO_ENCODER || (process.platform === "win32" ? "libopenh264" : "libx264");
  }
}
