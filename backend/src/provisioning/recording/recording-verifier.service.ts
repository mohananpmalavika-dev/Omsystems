/**
 * Recording Verifier Service
 * Evidence-based verification of camera recording capability
 * 
 * This service orchestrates a multi-stage verification pipeline:
 * 1. URI validation
 * 2. Live stream probe (ffprobe)
 * 3. Frame observation (ffmpeg)
 * 4. Sample recording (ffmpeg)
 * 5. Recorded file inspection (ffprobe)
 * 
 * CRITICAL: This service never returns synthetic success.
 * VERIFIED status requires positive evidence from actual media.
 */

import { Pool } from 'pg';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import {
  RecordingVerificationResult,
  RecordingVerificationReason,
  VerificationStatus,
  RecordingVerificationPolicy,
  DEFAULT_VERIFICATION_POLICY,
  MediaToolingCapabilities,
  LiveStreamEvidence,
  RecordingEvidence,
  VerificationWarning,
} from './recording-verification.types';
import { validateStreamUri, redactStreamUrl, getStreamEndpoint } from './utils/rtsp-url-redactor';
import { isInfrastructureError, getUserFriendlyMessage, extractStderrExcerpt } from './utils/media-error-classifier';
import { FFprobeLiveStreamAdapter } from './adapters/ffprobe-live-stream.adapter';
import { FFmpegFrameObserverAdapter } from './adapters/ffmpeg-frame-observer.adapter';
import { FFmpegSampleRecorderAdapter } from './adapters/ffmpeg-sample-recorder.adapter';
import { FFprobeFileInspectorAdapter } from './adapters/ffprobe-file-inspector.adapter';

export class RecordingVerifierService {
  private liveProbeAdapter: FFprobeLiveStreamAdapter;
  private frameObserverAdapter: FFmpegFrameObserverAdapter;
  private sampleRecorderAdapter: FFmpegSampleRecorderAdapter;
  private fileInspectorAdapter: FFprobeFileInspectorAdapter;
  private policy: RecordingVerificationPolicy;
  private capabilities: MediaToolingCapabilities | null = null;

  constructor(
    private pool: Pool,
    policy?: Partial<RecordingVerificationPolicy>
  ) {
    this.liveProbeAdapter = new FFprobeLiveStreamAdapter();
    this.frameObserverAdapter = new FFmpegFrameObserverAdapter();
    this.sampleRecorderAdapter = new FFmpegSampleRecorderAdapter();
    this.fileInspectorAdapter = new FFprobeFileInspectorAdapter();
    
    this.policy = {
      ...DEFAULT_VERIFICATION_POLICY,
      ...policy,
    };
  }

  /**
   * Initialize service and detect media tooling capabilities
   */
  async initialize(): Promise<void> {
    this.capabilities = await this.detectCapabilities();

    if (!this.capabilities.ffmpeg.available || !this.capabilities.ffprobe.available) {
      console.warn(
        'Recording verification infrastructure unavailable:',
        `ffmpeg=${this.capabilities.ffmpeg.available}`,
        `ffprobe=${this.capabilities.ffprobe.available}`
      );
    }
  }

  /**
   * Detect FFmpeg/FFprobe availability and versions
   */
  async detectCapabilities(): Promise<MediaToolingCapabilities> {
    const [ffmpegAvailable, ffprobeAvailable] = await Promise.all([
      this.sampleRecorderAdapter.isAvailable(),
      this.liveProbeAdapter.isAvailable(),
    ]);

    const [ffmpegVersion, ffprobeVersion] = await Promise.all([
      ffmpegAvailable ? this.sampleRecorderAdapter.getVersion() : Promise.resolve(null),
      ffprobeAvailable ? this.liveProbeAdapter.getVersion() : Promise.resolve(null),
    ]);

    return {
      ffmpeg: {
        available: ffmpegAvailable,
        version: ffmpegVersion || undefined,
        path: 'ffmpeg',
      },
      ffprobe: {
        available: ffprobeAvailable,
        version: ffprobeVersion || undefined,
        path: 'ffprobe',
      },
    };
  }

  /**
   * Verify recording capability for a single camera
   * 
   * This is the main verification pipeline.
   * 
   * CRITICAL RULE:
   * VERIFIED = live packets observed
   *            AND real media sample written
   *            AND written sample independently parses
   *            AND sample contains valid video
   * 
   * Everything else is FAILED or UNKNOWN.
   */
  async verifyCamera(
    cameraId: string,
    streamUrl: string
  ): Promise<RecordingVerificationResult> {
    const startTime = Date.now();

    console.log(`[RecordingVerifier] Starting verification for camera ${cameraId}`);
    console.log(`[RecordingVerifier] Stream endpoint: ${getStreamEndpoint(streamUrl)}`);

    // Ensure capabilities are detected
    if (!this.capabilities) {
      await this.initialize();
    }

    // Check infrastructure availability
    if (!this.capabilities!.ffmpeg.available || !this.capabilities!.ffprobe.available) {
      return this.unknown(
        'URI_VALIDATION',
        RecordingVerificationReason.VERIFICATION_INFRASTRUCTURE_UNAVAILABLE,
        'Recording verification infrastructure is unavailable (FFmpeg/FFprobe not installed)',
        {}
      );
    }

    // Stage 1: URI Validation
    const uriValidation = validateStreamUri(streamUrl);
    if (!uriValidation.valid) {
      return this.failed(
        'URI_VALIDATION',
        RecordingVerificationReason.INVALID_STREAM_URI,
        uriValidation.reason || 'Invalid stream URI',
        { uriValid: false }
      );
    }

    console.log(`[RecordingVerifier] URI validation passed`);

    // Stage 2: Live Stream Probe
    const transport = this.policy.transports[0]; // Use first transport
    const liveProbe = await this.liveProbeAdapter.probe({
      streamUrl,
      timeoutMs: this.policy.probeTimeoutMs,
      transport,
    });

    if (!liveProbe.success) {
      const failure = this.liveProbeAdapter.getFailureReason(liveProbe);
      return this.failed(
        'LIVE_PROBE',
        failure.reasonCode as RecordingVerificationReason,
        failure.reason,
        {
          probeDurationMs: liveProbe.durationMs,
          ffprobeExitCode: liveProbe.exitCode || undefined,
          stderrExcerpt: extractStderrExcerpt(liveProbe.stderr),
          uriValid: true,
        }
      );
    }

    const liveEvidence = this.liveProbeAdapter.extractEvidence(liveProbe);
    if (!liveEvidence) {
      return this.failed(
        'LIVE_PROBE',
        RecordingVerificationReason.NO_VIDEO_STREAM,
        'RTSP endpoint responded but no video stream detected',
        {
          probeDurationMs: liveProbe.durationMs,
          ffprobeExitCode: liveProbe.exitCode || undefined,
          uriValid: true,
        }
      );
    }

    console.log(`[RecordingVerifier] Live probe succeeded: ${liveEvidence.codec} ${liveEvidence.width}x${liveEvidence.height} @ ${liveEvidence.fps?.toFixed(1)}fps`);

    // Stage 3: Frame Observation
    const observation = await this.frameObserverAdapter.observe({
      streamUrl,
      durationSeconds: this.policy.observationSeconds,
      timeoutMs: this.policy.observationSeconds * 1000 + 5000,
      transport,
    });

    if (!this.frameObserverAdapter.isValidObservation(observation, this.policy.minObservedFrames)) {
      const failure = this.frameObserverAdapter.getFailureReason(observation);
      return this.failed(
        'PACKET_OBSERVATION',
        failure.reasonCode as RecordingVerificationReason,
        failure.reason,
        {
          probeDurationMs: liveProbe.durationMs,
          observationDurationMs: observation.observationDurationMs,
          ffmpegExitCode: observation.exitCode || undefined,
          stderrExcerpt: extractStderrExcerpt(observation.stderr),
          uriValid: true,
        }
      );
    }

    console.log(`[RecordingVerifier] Frame observation succeeded: ${observation.framesObserved} frames in ${(observation.observationDurationMs / 1000).toFixed(1)}s`);

    // Stage 4: Sample Recording
    const samplePath = join(
      tmpdir(),
      `recording-verification-${randomBytes(8).toString('hex')}.mkv`
    );

    const recording = await this.sampleRecorderAdapter.record({
      streamUrl,
      outputPath: samplePath,
      durationSeconds: this.policy.sampleSeconds,
      timeoutMs: this.policy.sampleSeconds * 1000 + 10000,
      transport,
      copyStream: true,
    });

    if (!recording.success) {
      // Clean up if file was partially created
      await this.sampleRecorderAdapter.cleanup(samplePath);

      return this.failed(
        'SAMPLE_RECORDING',
        RecordingVerificationReason.RECORDING_FAILED,
        recording.reason || 'Failed to record sample',
        {
          probeDurationMs: liveProbe.durationMs,
          observationDurationMs: observation.observationDurationMs,
          recordingDurationMs: recording.durationMs,
          ffmpegExitCode: recording.exitCode || undefined,
          stderrExcerpt: extractStderrExcerpt(recording.stderr),
          uriValid: true,
        }
      );
    }

    console.log(`[RecordingVerifier] Sample recording succeeded: ${samplePath}`);

    // Stage 5: Recorded File Inspection
    const inspection = await this.fileInspectorAdapter.inspect({
      filePath: samplePath,
      timeoutMs: this.policy.probeTimeoutMs,
      countFrames: true,
    });

    // Clean up sample file after inspection
    await this.sampleRecorderAdapter.cleanup(samplePath);

    if (!this.fileInspectorAdapter.isValidRecording(
      inspection,
      this.policy.minRecordingDurationSeconds,
      this.policy.minRecordingFrames,
      this.policy.minRecordingBytes
    )) {
      const failure = this.fileInspectorAdapter.getFailureReason(
        inspection,
        this.policy.minRecordingDurationSeconds,
        this.policy.minRecordingFrames,
        this.policy.minRecordingBytes
      );

      return this.failed(
        'RECORDED_FILE_PROBE',
        failure.reasonCode as RecordingVerificationReason,
        failure.reason,
        {
          probeDurationMs: liveProbe.durationMs,
          observationDurationMs: observation.observationDurationMs,
          recordingDurationMs: recording.durationMs,
          ffprobeExitCode: 0,
          ffmpegExitCode: recording.exitCode || undefined,
          uriValid: true,
        }
      );
    }

    const recordingEvidence = this.fileInspectorAdapter.extractEvidence(inspection, samplePath);
    if (!recordingEvidence) {
      return this.failed(
        'RECORDED_FILE_PROBE',
        RecordingVerificationReason.RECORDED_FILE_INVALID,
        'Failed to extract recording evidence',
        {
          probeDurationMs: liveProbe.durationMs,
          observationDurationMs: observation.observationDurationMs,
          recordingDurationMs: recording.durationMs,
          uriValid: true,
        }
      );
    }

    console.log(`[RecordingVerifier] File inspection succeeded: ${recordingEvidence.durationSeconds?.toFixed(1)}s, ${recordingEvidence.videoFrames} frames, ${(recordingEvidence.sizeBytes! / 1024).toFixed(0)}KB`);

    // Check for warnings
    const warnings = this.detectWarnings(liveEvidence, recordingEvidence);

    // Complete verification
    const verificationDurationMs = Date.now() - startTime;
    console.log(`[RecordingVerifier] Verification VERIFIED in ${(verificationDurationMs / 1000).toFixed(1)}s`);

    return {
      status: 'VERIFIED',
      stage: 'COMPLETE',
      
      liveStream: {
        ...liveEvidence,
        packetCount: observation.packetsObserved,
        frameCount: observation.framesObserved,
        transport,
      },

      recording: recordingEvidence,

      evidence: {
        probeDurationMs: liveProbe.durationMs,
        observationDurationMs: observation.observationDurationMs,
        recordingDurationMs: recording.durationMs,
        ffprobeExitCode: 0,
        ffmpegExitCode: 0,
        uriValid: true,
      },

      verifiedAt: new Date(),
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Detect warnings (non-fatal issues)
   */
  private detectWarnings(
    live: LiveStreamEvidence,
    recorded: RecordingEvidence
  ): VerificationWarning[] {
    const warnings: VerificationWarning[] = [];

    // Codec mismatch
    if (live.codec !== recorded.codec) {
      warnings.push({
        code: 'CODEC_CHANGED_DURING_RECORDING',
        message: `Codec changed from ${live.codec} to ${recorded.codec} during recording`,
        severity: 'medium',
      });
    }

    // Dimension mismatch
    if (
      live.width !== recorded.width ||
      live.height !== recorded.height
    ) {
      warnings.push({
        code: 'RECORDED_STREAM_DIMENSIONS_DIFFER',
        message: `Resolution changed from ${live.width}x${live.height} to ${recorded.width}x${recorded.height}`,
        severity: 'high',
      });
    }

    // Low FPS warning
    if (live.fps && live.fps < 5) {
      warnings.push({
        code: 'LOW_FRAME_RATE',
        message: `Stream FPS is ${live.fps.toFixed(1)} (below typical surveillance rates)`,
        severity: 'low',
      });
    }

    return warnings;
  }

  /**
   * Create a FAILED result
   */
  private failed(
    stage: RecordingVerificationResult['stage'],
    reasonCode: RecordingVerificationReason,
    reason: string,
    evidence: RecordingVerificationResult['evidence']
  ): RecordingVerificationResult {
    console.log(`[RecordingVerifier] Verification FAILED at ${stage}: ${reasonCode} - ${reason}`);

    return {
      status: 'FAILED',
      stage,
      reason,
      reasonCode,
      evidence,
      verifiedAt: null,
    };
  }

  /**
   * Create an UNKNOWN result (infrastructure unavailable)
   */
  private unknown(
    stage: RecordingVerificationResult['stage'],
    reasonCode: RecordingVerificationReason,
    reason: string,
    evidence: RecordingVerificationResult['evidence']
  ): RecordingVerificationResult {
    console.log(`[RecordingVerifier] Verification UNKNOWN at ${stage}: ${reasonCode} - ${reason}`);

    return {
      status: 'UNKNOWN',
      stage,
      reason,
      reasonCode,
      evidence,
      verifiedAt: null,
    };
  }

  /**
   * Get recording statistics for a branch
   */
  async getRecordingStats(branchId: string): Promise<{
    totalCameras: number;
    recordingCameras: number;
    verifiedCameras: number;
    failedCameras: number;
    unknownCameras: number;
    lastVerifiedAt?: Date;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total_cameras,
        COUNT(*) FILTER (WHERE recording_enabled = true) as recording_cameras,
        COUNT(*) FILTER (WHERE recording_verification_status = 'VERIFIED') as verified_cameras,
        COUNT(*) FILTER (WHERE recording_verification_status = 'FAILED') as failed_cameras,
        COUNT(*) FILTER (WHERE recording_verification_status = 'UNKNOWN') as unknown_cameras,
        MAX(recording_verified_at) as last_verified_at
      FROM cameras
      WHERE branch_id = $1 AND status = 'active'
    `;

    const result = await this.pool.query(query, [branchId]);
    const row = result.rows[0];

    return {
      totalCameras: parseInt(row.total_cameras) || 0,
      recordingCameras: parseInt(row.recording_cameras) || 0,
      verifiedCameras: parseInt(row.verified_cameras) || 0,
      failedCameras: parseInt(row.failed_cameras) || 0,
      unknownCameras: parseInt(row.unknown_cameras) || 0,
      lastVerifiedAt: row.last_verified_at,
    };
  }

  /**
   * Get media tooling capabilities
   */
  getCapabilities(): MediaToolingCapabilities | null {
    return this.capabilities;
  }

  /**
   * Get current verification policy
   */
  getPolicy(): RecordingVerificationPolicy {
    return { ...this.policy };
  }
}
