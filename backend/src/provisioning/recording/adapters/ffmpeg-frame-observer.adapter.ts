/**
 * FFmpeg Frame Observer Adapter
 * Observes live stream packets/frames over a time window
 */

import { FrameObservationResult } from '../recording-verification.types';
import { executeSubprocess, parseFFmpegProgress } from '../utils/subprocess-runner';
import { classifyMediaError, classifySpawnError } from '../utils/media-error-classifier';

export interface FrameObservationOptions {
  /** Stream URL to observe */
  streamUrl: string;

  /** How long to observe (seconds) */
  durationSeconds: number;

  /** Timeout in milliseconds (should be > durationSeconds) */
  timeoutMs: number;

  /** RTSP transport (tcp/udp) */
  transport: 'tcp' | 'udp';
}

export class FFmpegFrameObserverAdapter {
  /**
   * Observe frames from a live stream
   * 
   * This runs FFmpeg to:
   * 1. Connect to RTSP stream
   * 2. Decode video frames
   * 3. Count packets/frames over observation period
   * 4. Verify frames are actually arriving
   * 
   * Uses `-f null -` to discard output (we only want to observe, not record)
   */
  async observe(options: FrameObservationOptions): Promise<FrameObservationResult> {
    const args = [
      // Don't read from stdin
      '-nostdin',

      // Hide banner
      '-hide_banner',

      // Error level logging
      '-loglevel', 'error',

      // RTSP transport mode
      '-rtsp_transport', options.transport,

      // Input stream
      '-i', options.streamUrl,

      // Map only video stream
      '-map', '0:v:0',

      // Duration to observe
      '-t', String(options.durationSeconds),

      // Null output format (discard frames)
      '-f', 'null',

      // Progress reporting to stdout
      '-progress', 'pipe:1',

      // Output to null
      '-',
    ];

    const result = await executeSubprocess({
      command: 'ffmpeg',
      args,
      timeoutMs: options.timeoutMs,
      streamUrl: options.streamUrl,
    });

    // Handle spawn errors
    if (result.error) {
      return {
        success: false,
        framesObserved: 0,
        packetsObserved: 0,
        observationDurationMs: result.durationMs,
        exitCode: null,
        stderr: classifySpawnError(result.error).message,
      };
    }

    // Handle timeout
    if (result.timedOut) {
      return {
        success: false,
        framesObserved: 0,
        packetsObserved: 0,
        observationDurationMs: result.durationMs,
        exitCode: null,
        stderr: 'Observation timed out',
      };
    }

    // Parse progress output to get frame count
    const progress = parseFFmpegProgress(result.stdout);
    const framesObserved = progress.frame || 0;
    const avgFps = progress.fps;

    // Estimate packets (typically 1 packet per frame for video)
    const packetsObserved = framesObserved;

    return {
      success: result.exitCode === 0 && framesObserved > 0,
      framesObserved,
      packetsObserved,
      observationDurationMs: result.durationMs,
      exitCode: result.exitCode,
      stderr: result.stderr,
      avgFps,
    };
  }

  /**
   * Check if observation result indicates a working stream
   */
  isValidObservation(
    result: FrameObservationResult,
    minFrames: number
  ): boolean {
    return (
      result.success &&
      result.framesObserved >= minFrames &&
      result.exitCode === 0
    );
  }

  /**
   * Get failure reason from observation result
   */
  getFailureReason(result: FrameObservationResult): {
    reason: string;
    reasonCode: string;
  } {
    if (result.exitCode !== 0) {
      // Classify error from stderr
      const classification = classifyMediaError(result.stderr);
      return {
        reason: classification.message,
        reasonCode: classification.reason,
      };
    }

    if (result.framesObserved === 0) {
      return {
        reason: 'No frames received from stream',
        reasonCode: 'NO_DECODABLE_FRAMES',
      };
    }

    return {
      reason: 'Unknown observation failure',
      reasonCode: 'INTERNAL_ERROR',
    };
  }

  /**
   * Check if FFmpeg is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const result = await executeSubprocess({
        command: 'ffmpeg',
        args: ['-version'],
        timeoutMs: 5000,
      });

      return result.exitCode === 0 && !result.error;
    } catch {
      return false;
    }
  }

  /**
   * Get FFmpeg version
   */
  async getVersion(): Promise<string | null> {
    try {
      const result = await executeSubprocess({
        command: 'ffmpeg',
        args: ['-version'],
        timeoutMs: 5000,
      });

      if (result.exitCode === 0) {
        // Extract version from output
        const versionMatch = result.stdout.match(/ffmpeg\s+version\s+([^\s]+)/i);
        return versionMatch ? versionMatch[1] : 'unknown';
      }

      return null;
    } catch {
      return null;
    }
  }
}
