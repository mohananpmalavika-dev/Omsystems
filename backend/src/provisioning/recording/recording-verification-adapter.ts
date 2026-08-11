/**
 * Recording Verification Adapter
 * Adapts new evidence-based verifier to existing provisioning interfaces
 */

import { Pool } from 'pg';
import {
  RecordingVerificationResult as OldRecordingResult,
  RecordingProbeResult,
} from '../models/provisioning-result';
import { ProvisioningContext, RecordingConfig } from '../models/provisioning-context';
import { RecordingVerifierService } from './recording-verifier.service';
import { RecordingVerificationResult, VerificationStatus } from './recording-verification.types';

/**
 * Adapter that bridges new evidence-based verifier with existing provisioning flow
 */
export class RecordingVerificationAdapter {
  private verifier: RecordingVerifierService;

  constructor(pool: Pool) {
    this.verifier = new RecordingVerifierService(pool);
  }

  /**
   * Initialize the verifier (detect FFmpeg/FFprobe)
   */
  async initialize(): Promise<void> {
    await this.verifier.initialize();
  }

  /**
   * Verify recording capability for provisioned cameras
   * 
   * This adapts the new evidence-based verification to the old interface
   * while properly handling VERIFIED/FAILED/UNKNOWN states.
   */
  async verify(context: ProvisioningContext): Promise<OldRecordingResult> {
    const config = context.config.recording;
    const cameraResult = context.cameras?.data;

    if (!config.enabled) {
      // Recording verification not enabled
      return {
        probes: [],
        totalTested: 0,
        totalPassed: 0,
        successRate: 100,
        allCriticalPassed: true,
      };
    }

    if (!cameraResult || cameraResult.imported.length === 0) {
      throw new Error('No cameras available for recording verification');
    }

    // Select cameras to test
    const camerasToTest = this.selectCamerasForTesting(
      cameraResult.imported,
      config
    );

    // Run verifications
    const probes: RecordingProbeResult[] = [];
    const verificationResults: RecordingVerificationResult[] = [];

    for (const camera of camerasToTest) {
      try {
        // Fetch stream URL from database
        const streamUrl = await this.getStreamUrl(camera.cameraId);
        
        if (!streamUrl) {
          probes.push({
            cameraId: camera.cameraId,
            cameraName: camera.name,
            streamReceived: false,
            recordingStarted: false,
            recordingPersisted: false,
            playbackReadable: false,
            durationSeconds: 0,
            error: 'No stream URL configured for camera',
          });
          continue;
        }

        const result = await this.verifier.verifyCamera(
          camera.cameraId,
          streamUrl
        );

        verificationResults.push(result);

        // Convert to old probe format
        const probe = this.convertToProbeResult(
          camera.cameraId,
          camera.name,
          result
        );

        probes.push(probe);

        // Persist verification result
        await this.persistVerificationResult(
          context.tenantId,
          context.branchId,
          camera.cameraId,
          result
        );
      } catch (error) {
        console.error(`Verification failed for camera ${camera.cameraId}:`, error);

        probes.push({
          cameraId: camera.cameraId,
          cameraName: camera.name,
          streamReceived: false,
          recordingStarted: false,
          recordingPersisted: false,
          playbackReadable: false,
          durationSeconds: 0,
          error: error.message,
        });
      }
    }

    // Calculate results based on three-state model
    const totalTested = probes.length;
    const totalVerified = verificationResults.filter(
      r => r.status === 'VERIFIED'
    ).length;
    const totalFailed = verificationResults.filter(
      r => r.status === 'FAILED'
    ).length;
    const totalUnknown = verificationResults.filter(
      r => r.status === 'UNKNOWN'
    ).length;

    // Success rate based on verified vs tested (excluding infrastructure issues)
    const successRate = totalTested > 0
      ? (totalVerified / totalTested) * 100
      : 0;

    // CRITICAL: Handle three-state model
    // - VERIFIED = passed
    // - FAILED = failed
    // - UNKNOWN = infrastructure issue, should NOT block provisioning but should be flagged
    const allCriticalPassed = this.evaluateCriticalPassed(
      config,
      totalTested,
      totalVerified,
      totalFailed,
      totalUnknown
    );

    return {
      probes,
      totalTested,
      totalPassed: totalVerified,
      successRate,
      allCriticalPassed,
    };
  }

  /**
   * Evaluate if critical requirements are met
   * 
   * IMPORTANT: This properly handles the three-state model:
   * - VERIFIED cameras count as passed
   * - FAILED cameras count as failed
   * - UNKNOWN cameras (infrastructure issues) are handled separately
   */
  private evaluateCriticalPassed(
    config: RecordingConfig,
    totalTested: number,
    totalVerified: number,
    totalFailed: number,
    totalUnknown: number
  ): boolean {
    // If infrastructure is unavailable for all cameras, don't block provisioning
    // but log a warning
    if (totalUnknown === totalTested && totalTested > 0) {
      console.warn(
        '[RecordingVerification] All verifications returned UNKNOWN - infrastructure may be unavailable'
      );
      // Return false to indicate issue, but provisioning should handle this gracefully
      return false;
    }

    // If require all cameras to pass
    if (config.requireAllCamerasPass) {
      // All tested cameras must be VERIFIED (no FAILED or UNKNOWN)
      return totalVerified === totalTested;
    }

    // Otherwise, just need at least one VERIFIED camera
    return totalVerified > 0;
  }

  /**
   * Convert new verification result to old probe result format
   */
  private convertToProbeResult(
    cameraId: string,
    cameraName: string,
    result: RecordingVerificationResult
  ): RecordingProbeResult {
    const durationSeconds = result.evidence.recordingDurationMs
      ? result.evidence.recordingDurationMs / 1000
      : 0;

    switch (result.status) {
      case 'VERIFIED':
        return {
          cameraId,
          cameraName,
          streamReceived: true,
          recordingStarted: true,
          recordingPersisted: true,
          playbackReadable: true,
          firstPacketAt: result.verifiedAt || undefined,
          archiveCreatedAt: result.verifiedAt || undefined,
          archivePath: result.recording?.path,
          durationSeconds,
        };

      case 'FAILED':
        return {
          cameraId,
          cameraName,
          streamReceived: result.stage !== 'URI_VALIDATION',
          recordingStarted: ['SAMPLE_RECORDING', 'RECORDED_FILE_PROBE', 'COMPLETE'].includes(result.stage),
          recordingPersisted: result.stage === 'COMPLETE',
          playbackReadable: result.stage === 'COMPLETE',
          durationSeconds,
          error: result.reason,
        };

      case 'UNKNOWN':
        return {
          cameraId,
          cameraName,
          streamReceived: false,
          recordingStarted: false,
          recordingPersisted: false,
          playbackReadable: false,
          durationSeconds,
          error: `Infrastructure unavailable: ${result.reason}`,
        };
    }
  }

  /**
   * Persist verification result to database
   */
  private async persistVerificationResult(
    tenantId: string,
    branchId: string,
    cameraId: string,
    result: RecordingVerificationResult
  ): Promise<void> {
    const pool = this.verifier['pool'];

    // Update camera record with verification status
    const cameraUpdateQuery = `
      UPDATE cameras
      SET
        recording_verification_status = $1,
        recording_verification_reason = $2,
        recording_verification_stage = $3,
        recording_verified_at = $4,
        
        live_stream_codec = $5,
        live_stream_width = $6,
        live_stream_height = $7,
        live_stream_fps = $8,
        
        updated_at = NOW()
      WHERE
        id = $9
        AND tenant_id = $10
        AND branch_id = $11
    `;

    const cameraValues = [
      result.status,
      result.reasonCode || null,
      result.stage,
      result.verifiedAt,
      
      result.liveStream?.codec || null,
      result.liveStream?.width || null,
      result.liveStream?.height || null,
      result.liveStream?.fps || null,
      
      cameraId,
      tenantId,
      branchId,
    ];

    await pool.query(cameraUpdateQuery, cameraValues);

    // Insert full evidence into audit table
    const evidenceInsertQuery = `
      INSERT INTO recording_verification_runs (
        tenant_id,
        branch_id,
        camera_id,
        status,
        stage,
        reason_code,
        reason,
        
        live_codec,
        live_width,
        live_height,
        live_fps,
        live_pixel_format,
        live_bitrate,
        packets_observed,
        frames_observed,
        transport,
        
        sample_path,
        sample_size_bytes,
        sample_duration_seconds,
        sample_frame_count,
        sample_codec,
        sample_width,
        sample_height,
        sample_fps,
        sample_format,
        
        probe_duration_ms,
        observation_duration_ms,
        recording_duration_ms,
        ffprobe_exit_code,
        ffmpeg_exit_code,
        stderr_excerpt,
        
        warnings,
        verified_at,
        completed_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25,
        $26, $27, $28, $29, $30, $31,
        $32, $33, NOW()
      )
    `;

    const evidenceValues = [
      tenantId,
      branchId,
      cameraId,
      result.status,
      result.stage,
      result.reasonCode || null,
      result.reason || null,
      
      result.liveStream?.codec || null,
      result.liveStream?.width || null,
      result.liveStream?.height || null,
      result.liveStream?.fps || null,
      result.liveStream?.pixelFormat || null,
      result.liveStream?.bitrate || null,
      result.liveStream?.packetCount || null,
      result.liveStream?.frameCount || null,
      result.liveStream?.transport || null,
      
      result.recording?.path || null,
      result.recording?.sizeBytes || null,
      result.recording?.durationSeconds || null,
      result.recording?.videoFrames || null,
      result.recording?.codec || null,
      result.recording?.width || null,
      result.recording?.height || null,
      result.recording?.fps || null,
      result.recording?.format || null,
      
      result.evidence.probeDurationMs || null,
      result.evidence.observationDurationMs || null,
      result.evidence.recordingDurationMs || null,
      result.evidence.ffprobeExitCode || null,
      result.evidence.ffmpegExitCode || null,
      result.evidence.stderrExcerpt || null,
      
      result.warnings ? JSON.stringify(result.warnings) : null,
      result.verifiedAt,
    ];

    await pool.query(evidenceInsertQuery, evidenceValues);
  }

  /**
   * Get stream URL for a camera
   */
  private async getStreamUrl(cameraId: string): Promise<string | null> {
    const query = `
      SELECT stream_url
      FROM cameras
      WHERE id = $1
    `;

    const result = await this.verifier['pool'].query(query, [cameraId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].stream_url;
  }

  /**
   * Select cameras for testing based on configuration
   */
  private selectCamerasForTesting(
    cameras: any[],
    config: RecordingConfig
  ): any[] {
    const minToTest = Math.max(
      config.minimumCamerasToTest,
      config.requireAllCamerasPass ? cameras.length : 1
    );

    const numToTest = Math.min(minToTest, cameras.length);

    // Test first N cameras (in production, might stratify or randomize)
    return cameras.slice(0, numToTest);
  }

  /**
   * Get verifier capabilities
   */
  getCapabilities() {
    return this.verifier.getCapabilities();
  }

  /**
   * Get recording statistics
   */
  async getRecordingStats(branchId: string) {
    return await this.verifier.getRecordingStats(branchId);
  }
}
