/**
 * FFprobe Live Stream Adapter
 * Probes RTSP streams to extract metadata and verify connectivity
 */

import { StreamProbeResult, LiveStreamEvidence } from '../recording-verification.types';
import { executeSubprocess } from '../utils/subprocess-runner';
import { parseFrameRate } from '../utils/rtsp-url-redactor';
import { classifyMediaError, classifySpawnError } from '../utils/media-error-classifier';

export interface LiveProbeOptions {
  /** Stream URL to probe */
  streamUrl: string;

  /** Timeout in milliseconds */
  timeoutMs: number;

  /** RTSP transport (tcp/udp) */
  transport: 'tcp' | 'udp';
}

export class FFprobeLiveStreamAdapter {
  /**
   * Probe a live RTSP stream to extract metadata
   * 
   * This performs:
   * 1. Network connection to RTSP server
   * 2. RTSP negotiation (DESCRIBE, SETUP)
   * 3. Stream metadata extraction (codec, resolution, fps)
   */
  async probe(options: LiveProbeOptions): Promise<StreamProbeResult> {
    const args = [
      // Error level logging
      '-v', 'error',

      // RTSP transport mode
      '-rtsp_transport', options.transport,

      // Read/write timeout (in microseconds)
      '-rw_timeout', String(options.timeoutMs * 1000),

      // Show stream information
      '-show_streams',

      // Show format information
      '-show_format',

      // Output as JSON
      '-of', 'json',

      // Stream URL
      options.streamUrl,
    ];

    const result = await executeSubprocess({
      command: 'ffprobe',
      args,
      timeoutMs: options.timeoutMs,
      streamUrl: options.streamUrl,
    });

    // Handle spawn errors
    if (result.error) {
      return {
        success: false,
        exitCode: null,
        durationMs: result.durationMs,
        streams: [],
        stderr: classifySpawnError(result.error).message,
      };
    }

    // Handle timeout
    if (result.timedOut) {
      return {
        success: false,
        exitCode: null,
        durationMs: result.durationMs,
        streams: [],
        stderr: 'Probe operation timed out',
      };
    }

    // Parse JSON output
    let parsed: any = {};
    try {
      if (result.stdout) {
        parsed = JSON.parse(result.stdout);
      }
    } catch (error) {
      // Parsing errors are handled below
    }

    return {
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      streams: parsed.streams || [],
      format: parsed.format,
      stderr: result.stderr,
    };
  }

  /**
   * Extract live stream evidence from probe result
   */
  extractEvidence(probeResult: StreamProbeResult): LiveStreamEvidence | null {
    // Find video stream
    const videoStream = probeResult.streams.find(
      stream => stream.codec_type === 'video'
    );

    if (!videoStream) {
      return null;
    }

    // Parse frame rate
    const fps = parseFrameRate(
      videoStream.avg_frame_rate || videoStream.r_frame_rate
    );

    // Parse bitrate
    const bitrate = videoStream.bit_rate
      ? parseInt(videoStream.bit_rate, 10)
      : undefined;

    return {
      codec: videoStream.codec_name,
      width: videoStream.width,
      height: videoStream.height,
      fps,
      pixelFormat: videoStream.pix_fmt,
      bitrate: Number.isFinite(bitrate) ? bitrate : undefined,
    };
  }

  /**
   * Check if probe result indicates a working stream
   */
  isValidStream(probeResult: StreamProbeResult): boolean {
    if (!probeResult.success) {
      return false;
    }

    // Must have at least one video stream
    const hasVideo = probeResult.streams.some(
      stream => stream.codec_type === 'video'
    );

    return hasVideo;
  }

  /**
   * Get failure reason from probe result
   */
  getFailureReason(probeResult: StreamProbeResult): {
    reason: string;
    reasonCode: string;
  } {
    if (probeResult.success) {
      // Check if video stream is missing
      const hasVideo = probeResult.streams.some(
        stream => stream.codec_type === 'video'
      );

      if (!hasVideo) {
        return {
          reason: 'RTSP endpoint responded but no video stream detected',
          reasonCode: 'NO_VIDEO_STREAM',
        };
      }

      return {
        reason: 'Unknown probe failure',
        reasonCode: 'INTERNAL_ERROR',
      };
    }

    // Classify error from stderr
    const classification = classifyMediaError(probeResult.stderr);

    return {
      reason: classification.message,
      reasonCode: classification.reason,
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
