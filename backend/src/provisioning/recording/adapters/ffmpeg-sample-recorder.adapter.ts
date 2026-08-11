/**
 * FFmpeg Sample Recorder Adapter
 * Records short video samples from RTSP streams for verification
 */

import { promises as fs } from 'fs';
import { SampleRecordingResult } from '../recording-verification.types';
import { executeSubprocess } from '../utils/subprocess-runner';
import { classifyMediaError, classifySpawnError } from '../utils/media-error-classifier';

export interface SampleRecordingOptions {
  /** Stream URL to record */
  streamUrl: string;

  /** Output file path */
  outputPath: string;

  /** How long to record (seconds) */
  durationSeconds: number;

  /** Timeout in milliseconds (should be > durationSeconds) */
  timeoutMs: number;

  /** RTSP transport (tcp/udp) */
  transport: 'tcp' | 'udp';

  /** Whether to copy stream (true) or transcode (false) */
  copyStream?: boolean;
}

export class FFmpegSampleRecorderAdapter {
  /**
   * Record a short sample from RTSP stream
   * 
   * This:
   * 1. Connects to RTSP stream
   * 2. Records actual video packets to file
   * 3. Uses stream copy (no transcoding) by default for efficiency
   * 4. Saves to MKV format (tolerates timestamp issues better than MP4)
   */
  async record(options: SampleRecordingOptions): Promise<SampleRecordingResult> {
    const copyStream = options.copyStream !== false; // Default to true

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

      // Duration to record
      '-t', String(options.durationSeconds),

      // Codec selection
      '-c:v', copyStream ? 'copy' : 'libx264',

      // Overwrite output file
      '-y',

      // Output file
      options.outputPath,
    ];

    const result = await executeSubprocess({
      command: 'ffmpeg',
      args,
      timeoutMs: options.timeoutMs,
      streamUrl: options.streamUrl,
    });

    // Handle spawn errors
    if (result.error) {
      const classification = classifySpawnError(result.error);
      return {
        success: false,
        path: options.outputPath,
        durationMs: result.durationMs,
        exitCode: null,
        stderr: result.stderr,
        reason: classification.message,
      };
    }

    // Handle timeout
    if (result.timedOut) {
      return {
        success: false,
        path: options.outputPath,
        durationMs: result.durationMs,
        exitCode: null,
        stderr: result.stderr,
        reason: 'Recording timed out',
      };
    }

    // Check if file was created
    let fileExists = false;
    try {
      await fs.access(options.outputPath);
      fileExists = true;
    } catch {
      fileExists = false;
    }

    // Recording is successful if:
    // 1. Exit code is 0
    // 2. Output file exists
    const success = result.exitCode === 0 && fileExists;

    if (!success && result.exitCode !== 0) {
      const classification = classifyMediaError(result.stderr);
      return {
        success: false,
        path: options.outputPath,
        durationMs: result.durationMs,
        exitCode: result.exitCode,
        stderr: result.stderr,
        reason: classification.message,
      };
    }

    if (!success && !fileExists) {
      return {
        success: false,
        path: options.outputPath,
        durationMs: result.durationMs,
        exitCode: result.exitCode,
        stderr: result.stderr,
        reason: 'Recording file was not created',
      };
    }

    return {
      success: true,
      path: options.outputPath,
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      stderr: result.stderr,
    };
  }

  /**
   * Clean up recorded sample file
   */
  async cleanup(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore cleanup errors
      console.warn(`Failed to cleanup sample file ${filePath}:`, error);
    }
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
