/**
 * FFprobe File Inspector Adapter
 * Inspects recorded video files to validate they contain valid media
 */

import { promises as fs } from 'fs';
import { FileInspectionResult, RecordingEvidence } from '../recording-verification.types';
import { executeSubprocess } from '../utils/subprocess-runner';
import { parseFrameRate } from '../utils/rtsp-url-redactor';
import { classifyMediaError, classifySpawnError } from '../utils/media-error-classifier';

export interface FileInspectionOptions {
  /** Path to file to inspect */
  filePath: string;

  /** Timeout in milliseconds */
  timeoutMs: number;

  /** Whether to count frames (slower but more accurate) */
  countFrames?: boolean;
}

export class FFprobeFileInspectorAdapter {
  /**
   * Inspect a recorded video file
   * 
   * This:
   * 1. Verifies file exists and has non-zero size
   * 2. Uses ffprobe to extract metadata
   * 3. Validates video stream is present and readable
   * 4. Extracts codec, resolution, duration, frame count
   */
  async inspect(options: FileInspectionOptions): Promise<FileInspectionResult> {
    // First, check file exists and get size
    let sizeBytes: number;
    try {
      const stats = await fs.stat(options.filePath);
      sizeBytes = stats.size;

      if (sizeBytes === 0) {
        return {
          valid: false,
          reason: 'Recorded file is empty (0 bytes)',
          sizeBytes: 0,
        };
      }
    } catch (error) {
      return {
        valid: false,
        reason: 'Recorded file does not exist or cannot be accessed',
      };
    }

    // Build ffprobe arguments
    const args = [
      // Error level logging
      '-v', 'error',

      // Show stream information
      '-show_streams',

      // Show format information
      '-show_format',

      // Output as JSON
      '-of', 'json',
    ];

    // Optionally count frames (slower)
    if (options.countFrames) {
      args.push('-count_frames');
    }

    args.push(options.filePath);

    const result = await executeSubprocess({
      command: 'ffprobe',
      args,
      timeoutMs: options.timeoutMs,
    });

    // Handle spawn errors
    if (result.error) {
      const classification = classifySpawnError(result.error);
      return {
        valid: false,
        reason: classification.message,
        sizeBytes,
      };
    }

    // Handle timeout
    if (result.timedOut) {
      return {
        valid: false,
        reason: 'File inspection timed out',
        sizeBytes,
      };
    }

    // Check exit code
    if (result.exitCode !== 0) {
      const classification = classifyMediaError(result.stderr);
      return {
        valid: false,
        reason: classification.message,
        sizeBytes,
      };
    }

    // Parse JSON output
    let parsed: any = {};
    try {
      if (result.stdout) {
        parsed = JSON.parse(result.stdout);
      }
    } catch (error) {
      return {
        valid: false,
        reason: 'Failed to parse file metadata',
        sizeBytes,
      };
    }

    // Find video stream
    const videoStream = (parsed.streams || []).find(
      (stream: any) => stream.codec_type === 'video'
    );

    if (!videoStream) {
      return {
        valid: false,
        reason: 'No video stream found in recorded file',
        sizeBytes,
        hasVideo: false,
        hasAudio: (parsed.streams || []).some((s: any) => s.codec_type === 'audio'),
      };
    }

    // Parse metadata
    const codec = videoStream.codec_name;
    const width = videoStream.width;
    const height = videoStream.height;
    const fps = parseFrameRate(
      videoStream.avg_frame_rate || videoStream.r_frame_rate
    );

    // Parse duration (prefer stream duration, fall back to format)
    const durationSeconds = parseFloat(
      videoStream.duration || parsed.format?.duration || '0'
    );

    // Parse frame count
    let frameCount: number | undefined;
    if (options.countFrames) {
      frameCount = parseInt(videoStream.nb_read_frames || videoStream.nb_frames || '0', 10);
    }

    // Get format
    const format = parsed.format?.format_name;

    return {
      valid: true,
      sizeBytes,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : undefined,
      frameCount: Number.isFinite(frameCount) ? frameCount : undefined,
      codec,
      width,
      height,
      fps,
      format,
      hasVideo: true,
      hasAudio: (parsed.streams || []).some((s: any) => s.codec_type === 'audio'),
    };
  }

  /**
   * Validate inspection result meets minimum requirements
   */
  isValidRecording(
    result: FileInspectionResult,
    minDurationSeconds: number,
    minFrames: number,
    minBytes: number
  ): boolean {
    if (!result.valid) {
      return false;
    }

    // Check file size
    if (result.sizeBytes && result.sizeBytes < minBytes) {
      return false;
    }

    // Check duration
    if (result.durationSeconds && result.durationSeconds < minDurationSeconds) {
      return false;
    }

    // Check frame count (if available)
    if (result.frameCount !== undefined && result.frameCount < minFrames) {
      return false;
    }

    // Must have video
    if (!result.hasVideo) {
      return false;
    }

    return true;
  }

  /**
   * Extract recording evidence from inspection result
   */
  extractEvidence(
    result: FileInspectionResult,
    filePath: string
  ): RecordingEvidence | null {
    if (!result.valid) {
      return null;
    }

    return {
      path: filePath,
      sizeBytes: result.sizeBytes,
      durationSeconds: result.durationSeconds,
      videoFrames: result.frameCount,
      codec: result.codec,
      width: result.width,
      height: result.height,
      fps: result.fps,
      format: result.format,
    };
  }

  /**
   * Get failure reason from inspection result
   */
  getFailureReason(
    result: FileInspectionResult,
    minDurationSeconds: number,
    minFrames: number,
    minBytes: number
  ): {
    reason: string;
    reasonCode: string;
  } {
    if (!result.valid) {
      return {
        reason: result.reason || 'Unknown validation failure',
        reasonCode: 'RECORDED_FILE_INVALID',
      };
    }

    if (result.sizeBytes && result.sizeBytes < minBytes) {
      return {
        reason: `Recording file too small (${result.sizeBytes} bytes, minimum ${minBytes})`,
        reasonCode: 'RECORDED_FILE_TOO_SHORT',
      };
    }

    if (result.durationSeconds && result.durationSeconds < minDurationSeconds) {
      return {
        reason: `Recording duration too short (${result.durationSeconds.toFixed(1)}s, minimum ${minDurationSeconds}s)`,
        reasonCode: 'RECORDED_FILE_TOO_SHORT',
      };
    }

    if (result.frameCount !== undefined && result.frameCount < minFrames) {
      return {
        reason: `Recording has too few frames (${result.frameCount}, minimum ${minFrames})`,
        reasonCode: 'RECORDED_FILE_TOO_SHORT',
      };
    }

    if (!result.hasVideo) {
      return {
        reason: 'Recording does not contain video',
        reasonCode: 'RECORDED_FILE_INVALID',
      };
    }

    return {
      reason: 'Unknown validation failure',
      reasonCode: 'RECORDED_FILE_INVALID',
    };
  }

  /**
   * Check if FFprobe is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const result = await executeSubprocess({
        command: 'ffprobe',
        args: ['-version'],
        timeoutMs: 5000,
      });

      return result.exitCode === 0 && !result.error;
    } catch {
      return false;
    }
  }

  /**
   * Get FFprobe version
   */
  async getVersion(): Promise<string | null> {
    try {
      const result = await executeSubprocess({
        command: 'ffprobe',
        args: ['-version'],
        timeoutMs: 5000,
      });

      if (result.exitCode === 0) {
        // Extract version from output
        const versionMatch = result.stdout.match(/ffprobe\s+version\s+([^\s]+)/i);
        return versionMatch ? versionMatch[1] : 'unknown';
      }

      return null;
    } catch {
      return null;
    }
  }
}
