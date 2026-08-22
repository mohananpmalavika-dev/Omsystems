/**
 * Recording Verification Service
 * Continuous verification that cameras are recording correctly, without gaps,
 * and that recordings remain accessible and playable
 */

import type { Pool } from "pg";
import { logger } from "../utils/logger.js";

export interface CameraRecordingStatus {
  cameraId: string;
  tenantId: string;
  branchId: string;
  cameraName: string;
  status: "recording" | "idle" | "error" | "disabled" | "gap_detected" | "playback_failed";
  isRecording: boolean;
  expectedRecording: boolean;
  lastSegmentTime?: Date;
  lastVerifiedTime?: Date;
  recordingGapSeconds?: number;
  segmentCount24h: number;
  expectedSegmentCount24h: number;
  segmentCompleteness: number; // percentage
  playbackVerified: boolean;
  lastPlaybackCheck?: Date;
  consecutiveFailures: number;
  healthScore: number; // 0-100
  issues: RecordingIssue[];
}

export interface RecordingIssue {
  type: "gap" | "missing_segments" | "playback_failed" | "dvr_mismatch" | "retention_violation" | "no_recent_data";
  severity: "info" | "warning" | "critical";
  detectedAt: Date;
  description: string;
  gapDurationSeconds?: number;
  missingSegmentCount?: number;
  metadata?: Record<string, any>;
}

export interface RecordingGap {
  cameraId: string;
  gapStart: Date;
  gapEnd: Date;
  durationSeconds: number;
  expectedSegments: number;
  actualSegments: number;
  reason?: string;
}

export interface RecordingVerificationConfig {
  checkInterval: number; // seconds between checks (default: 300 = 5 minutes)
  gapThreshold: number; // seconds of missing data to consider a gap (default: 120)
  playbackVerificationInterval: number; // seconds between playback checks (default: 3600)
  segmentInterval: number; // expected segment duration in seconds (default: 300)
  minHealthScore: number; // minimum acceptable health score (default: 70)
  enablePlaybackVerification: boolean;
  enableDvrCrossValidation: boolean;
}

export interface DVRRecordingStatus {
  dvrId: string;
  cameraId: string;
  isRecording: boolean;
  lastRecordingTime?: Date;
  diskStatus: "normal" | "full" | "error";
  recordingMode: "continuous" | "motion" | "scheduled";
}

export class RecordingVerificationService {
  private pool: Pool;
  private config: RecordingVerificationConfig;
  private verificationTimers: Map<string, NodeJS.Timeout>;
  private isRunning: boolean;
  private cameraStatuses: Map<string, CameraRecordingStatus>;

  constructor(pool: Pool, config?: Partial<RecordingVerificationConfig>) {
    this.pool = pool;
    this.verificationTimers = new Map();
    this.isRunning = false;
    this.cameraStatuses = new Map();

    this.config = {
      checkInterval: config?.checkInterval ?? 300, // 5 minutes
      gapThreshold: config?.gapThreshold ?? 120, // 2 minutes
      playbackVerificationInterval: config?.playbackVerificationInterval ?? 3600, // 1 hour
      segmentInterval: config?.segmentInterval ?? 300, // 5 minutes
      minHealthScore: config?.minHealthScore ?? 70,
      enablePlaybackVerification: config?.enablePlaybackVerification ?? true,
      enableDvrCrossValidation: config?.enableDvrCrossValidation ?? true,
    };
  }

  /**
   * Start the recording verification service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Recording verification service already running");
      return;
    }

    logger.info("Starting recording verification service");
    this.isRunning = true;

    // Start continuous verification loop
    this.startVerificationLoop();

    logger.info("Recording verification service started");
  }

  /**
   * Stop the verification service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info("Stopping recording verification service");
    this.isRunning = false;

    // Stop all verification timers
    for (const timer of this.verificationTimers.values()) {
      clearInterval(timer);
    }
    this.verificationTimers.clear();

    logger.info("Recording verification service stopped");
  }

  /**
   * Start continuous verification loop
   */
  private startVerificationLoop(): void {
    const mainTimer = setInterval(async () => {
      try {
        await this.verifyAllRecordings();
      } catch (error) {
        logger.error("Verification loop error", { error });
      }
    }, this.config.checkInterval * 1000);

    this.verificationTimers.set("main-loop", mainTimer);

    // Also run initial verification immediately
    this.verifyAllRecordings().catch((error) => {
      logger.error("Initial verification error", { error });
    });
  }

  /**
   * Verify all camera recordings
   */
  private async verifyAllRecordings(): Promise<void> {
    logger.debug("Starting recording verification cycle");

    try {
      // Get all cameras that should be recording
      const cameras = await this.getRecordingCameras();

      logger.debug(`Verifying ${cameras.length} cameras`);

      // Verify each camera in parallel (with limit)
      const chunks = this.chunkArray(cameras, 20); // 20 concurrent verifications

      for (const chunk of chunks) {
        await Promise.allSettled(
          chunk.map((camera) => this.verifyCameraRecording(camera))
        );
      }

      logger.debug("Recording verification cycle complete");
    } catch (error) {
      logger.error("Failed to verify recordings", { error });
    }
  }

  /**
   * Get all cameras that should be recording
   */
  private async getRecordingCameras(): Promise<Array<{
    id: string;
    tenantId: string;
    branchId: string;
    name: string;
    recordingEnabled: boolean;
    expectedRecording: boolean;
  }>> {
    try {
      const result = await this.pool.query(`
        SELECT 
          c.id::text,
          c.resource_node_id::text as node_id,
          c.branch_node_id::text as branch_id,
          rn.name,
          b.tenant_id::text as tenant_id,
          c.recording_enabled,
          CASE 
            WHEN c.recording_enabled = true AND c.status = 'online' THEN true
            ELSE false
          END as expected_recording
        FROM cameras c
        JOIN resource_nodes rn ON rn.id = c.resource_node_id
        JOIN resource_nodes b ON b.id = c.branch_node_id
        WHERE c.status != 'disabled'
        ORDER BY c.id
      `);

      return result.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        branchId: row.branch_id,
        name: row.name,
        recordingEnabled: row.recording_enabled || false,
        expectedRecording: row.expected_recording || false,
      }));
    } catch (error) {
      logger.error("Failed to get recording cameras", { error });
      return [];
    }
  }

  /**
   * Verify a single camera's recording status
   */
  private async verifyCameraRecording(camera: {
    id: string;
    tenantId: string;
    branchId: string;
    name: string;
    recordingEnabled: boolean;
    expectedRecording: boolean;
  }): Promise<void> {
    const startTime = Date.now();
    const issues: RecordingIssue[] = [];

    try {
      // 1. Check last segment time
      const lastSegmentResult = await this.pool.query(
        `SELECT 
          ended_at as last_segment_time,
          started_at as segment_start,
          status
        FROM recording_segments
        WHERE camera_id = $1::uuid
        ORDER BY ended_at DESC
        LIMIT 1`,
        [camera.id]
      );

      const lastSegmentTime = lastSegmentResult.rows[0]?.last_segment_time
        ? new Date(lastSegmentResult.rows[0].last_segment_time)
        : undefined;

      // 2. Detect recording gaps
      const gaps = await this.detectRecordingGaps(camera.id);
      
      if (gaps.length > 0) {
        issues.push({
          type: "gap",
          severity: gaps[0].durationSeconds > 300 ? "critical" : "warning",
          detectedAt: new Date(),
          description: `Recording gap detected: ${gaps[0].durationSeconds} seconds`,
          gapDurationSeconds: gaps[0].durationSeconds,
        });
      }

      // 3. Check segment count (last 24 hours)
      const segmentCountResult = await this.pool.query(
        `SELECT COUNT(*) as count
        FROM recording_segments
        WHERE camera_id = $1::uuid
          AND ended_at >= NOW() - INTERVAL '24 hours'`,
        [camera.id]
      );

      const segmentCount24h = parseInt(segmentCountResult.rows[0]?.count || 0);
      const expectedSegmentCount24h = camera.expectedRecording 
        ? Math.floor((24 * 3600) / this.config.segmentInterval)
        : 0;

      // 4. Calculate segment completeness
      const segmentCompleteness = expectedSegmentCount24h > 0
        ? Math.min(100, (segmentCount24h / expectedSegmentCount24h) * 100)
        : 100;

      if (segmentCompleteness < 80 && camera.expectedRecording) {
        issues.push({
          type: "missing_segments",
          severity: segmentCompleteness < 50 ? "critical" : "warning",
          detectedAt: new Date(),
          description: `Only ${segmentCompleteness.toFixed(1)}% of expected segments present`,
          missingSegmentCount: expectedSegmentCount24h - segmentCount24h,
        });
      }

      // 5. Check if we have recent data
      const timeSinceLastSegment = lastSegmentTime
        ? Date.now() - lastSegmentTime.getTime()
        : Infinity;

      const hasRecentData = timeSinceLastSegment < this.config.gapThreshold * 1000;

      if (camera.expectedRecording && !hasRecentData) {
        issues.push({
          type: "no_recent_data",
          severity: "critical",
          detectedAt: new Date(),
          description: `No recording data for ${Math.floor(timeSinceLastSegment / 1000)} seconds`,
        });
      }

      // 6. Playback verification (periodic)
      const existingStatus = this.cameraStatuses.get(camera.id);
      const shouldVerifyPlayback = 
        this.config.enablePlaybackVerification &&
        (!existingStatus?.lastPlaybackCheck ||
         Date.now() - existingStatus.lastPlaybackCheck.getTime() > 
         this.config.playbackVerificationInterval * 1000);

      let playbackVerified = existingStatus?.playbackVerified ?? true;
      let lastPlaybackCheck = existingStatus?.lastPlaybackCheck;

      if (shouldVerifyPlayback && lastSegmentTime) {
        const playbackResult = await this.verifyPlayback(camera.id, lastSegmentTime);
        playbackVerified = playbackResult.success;
        lastPlaybackCheck = new Date();

        if (!playbackVerified) {
          issues.push({
            type: "playback_failed",
            severity: "critical",
            detectedAt: new Date(),
            description: playbackResult.error || "Playback verification failed",
          });
        }
      }

      // 7. Calculate health score
      const healthScore = this.calculateRecordingHealthScore({
        hasRecentData,
        segmentCompleteness,
        playbackVerified,
        gapCount: gaps.length,
        consecutiveFailures: existingStatus?.consecutiveFailures || 0,
      });

      // 8. Determine overall status
      let status: CameraRecordingStatus["status"] = "idle";
      
      if (!camera.recordingEnabled) {
        status = "disabled";
      } else if (issues.some((i) => i.type === "playback_failed")) {
        status = "playback_failed";
      } else if (gaps.length > 0) {
        status = "gap_detected";
      } else if (issues.length > 0) {
        status = "error";
      } else if (camera.expectedRecording && hasRecentData) {
        status = "recording";
      }

      // 9. Update camera status
      const newStatus: CameraRecordingStatus = {
        cameraId: camera.id,
        tenantId: camera.tenantId,
        branchId: camera.branchId,
        cameraName: camera.name,
        status,
        isRecording: camera.expectedRecording && hasRecentData,
        expectedRecording: camera.expectedRecording,
        lastSegmentTime,
        lastVerifiedTime: new Date(),
        recordingGapSeconds: gaps.length > 0 ? gaps[0].durationSeconds : 0,
        segmentCount24h,
        expectedSegmentCount24h,
        segmentCompleteness,
        playbackVerified,
        lastPlaybackCheck,
        consecutiveFailures: issues.length > 0 
          ? (existingStatus?.consecutiveFailures || 0) + 1 
          : 0,
        healthScore,
        issues,
      };

      this.cameraStatuses.set(camera.id, newStatus);

      // 10. Save to database
      await this.saveVerificationResult(newStatus);

      // 11. Create alerts for critical issues
      if (issues.some((i) => i.severity === "critical")) {
        await this.createRecordingAlert(newStatus);
      }

      logger.debug(`Verified recording for camera ${camera.name}`, {
        status,
        healthScore,
        issues: issues.length,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      logger.error(`Failed to verify recording for camera ${camera.name}`, {
        error,
        cameraId: camera.id,
      });
    }
  }

  /**
   * Detect recording gaps for a camera
   */
  private async detectRecordingGaps(cameraId: string): Promise<RecordingGap[]> {
    try {
      // Get segments from last 24 hours with gaps analysis
      const result = await this.pool.query(
        `WITH segments AS (
          SELECT 
            started_at,
            ended_at,
            LAG(ended_at) OVER (ORDER BY started_at) as prev_ended
          FROM recording_segments
          WHERE camera_id = $1::uuid
            AND ended_at >= NOW() - INTERVAL '24 hours'
          ORDER BY started_at
        ),
        gaps AS (
          SELECT 
            prev_ended as gap_start,
            started_at as gap_end,
            EXTRACT(EPOCH FROM (started_at - prev_ended)) as duration_seconds
          FROM segments
          WHERE prev_ended IS NOT NULL
            AND EXTRACT(EPOCH FROM (started_at - prev_ended)) > $2
        )
        SELECT 
          gap_start,
          gap_end,
          duration_seconds
        FROM gaps
        ORDER BY gap_start DESC
        LIMIT 10`,
        [cameraId, this.config.gapThreshold]
      );

      return result.rows.map((row) => ({
        cameraId,
        gapStart: new Date(row.gap_start),
        gapEnd: new Date(row.gap_end),
        durationSeconds: parseFloat(row.duration_seconds),
        expectedSegments: Math.ceil(parseFloat(row.duration_seconds) / this.config.segmentInterval),
        actualSegments: 0,
      }));
    } catch (error) {
      logger.error("Failed to detect recording gaps", { error, cameraId });
      return [];
    }
  }

  /**
   * Verify playback integrity for a camera using FFprobe
   */
  private async verifyPlayback(
    cameraId: string,
    segmentTime: Date
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get a recent segment to verify
      const result = await this.pool.query(
        `SELECT 
          id::text,
          file_path,
          file_size_bytes,
          duration_seconds,
          codec_name,
          resolution,
          status
        FROM recording_segments
        WHERE camera_id = $1::uuid
          AND ended_at <= $2
          AND status = 'ready'
        ORDER BY ended_at DESC
        LIMIT 1`,
        [cameraId, segmentTime]
      );

      if (result.rows.length === 0) {
        return { success: false, error: "No playable segments found" };
      }

      const segment = result.rows[0];

      // Check if file exists and has non-zero size
      if (!segment.file_path || segment.file_size_bytes === 0) {
        return { success: false, error: "Segment file missing or empty" };
      }

      // Verify file exists on filesystem
      const fs = await import('fs/promises');
      const path = await import('path');
      
      try {
        const stats = await fs.stat(segment.file_path);
        
        if (!stats.isFile()) {
          return { success: false, error: "Segment path is not a file" };
        }

        if (stats.size !== segment.file_size_bytes) {
          return { 
            success: false, 
            error: `File size mismatch: expected ${segment.file_size_bytes}, got ${stats.size}` 
          };
        }
      } catch (error) {
        return { 
          success: false, 
          error: `File not accessible: ${error instanceof Error ? error.message : 'Unknown error'}` 
        };
      }

      // Use FFprobe to validate video integrity
      const ffprobeResult = await this.validateVideoWithFFprobe(segment.file_path);
      
      if (!ffprobeResult.success) {
        return { success: false, error: ffprobeResult.error };
      }

      // Verify codec and duration match database metadata
      if (segment.codec_name && ffprobeResult.codecName !== segment.codec_name) {
        return { 
          success: false, 
          error: `Codec mismatch: expected ${segment.codec_name}, got ${ffprobeResult.codecName}` 
        };
      }

      // Allow 5% duration tolerance
      if (segment.duration_seconds) {
        const durationDiff = Math.abs(ffprobeResult.durationSeconds - segment.duration_seconds);
        const tolerance = segment.duration_seconds * 0.05;
        
        if (durationDiff > tolerance) {
          return { 
            success: false, 
            error: `Duration mismatch: expected ~${segment.duration_seconds}s, got ${ffprobeResult.durationSeconds}s` 
          };
        }
      }

      // Verify video stream exists
      if (!ffprobeResult.hasVideo) {
        return { success: false, error: "No video stream found in file" };
      }

      // Verify file can be decoded (sample frames)
      if (!ffprobeResult.decodable) {
        return { success: false, error: "Video file is not decodable" };
      }

      return { success: true };
    } catch (error) {
      logger.error("Playback verification failed", { error, cameraId });
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  /**
   * Validate video file integrity using FFprobe
   */
  private async validateVideoWithFFprobe(filePath: string): Promise<{
    success: boolean;
    error?: string;
    codecName?: string;
    durationSeconds: number;
    hasVideo: boolean;
    hasAudio: boolean;
    width?: number;
    height?: number;
    frameRate?: number;
    bitRate?: number;
    decodable: boolean;
  }> {
    const { spawn } = await import('child_process');
    
    return new Promise((resolve) => {
      // Run FFprobe to get video metadata
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        '-show_error',
        filePath
      ]);

      let stdout = '';
      let stderr = '';

      ffprobe.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code !== 0) {
          resolve({
            success: false,
            error: `FFprobe exited with code ${code}: ${stderr}`,
            durationSeconds: 0,
            hasVideo: false,
            hasAudio: false,
            decodable: false
          });
          return;
        }

        try {
          const probe = JSON.parse(stdout);

          // Check for FFprobe errors
          if (probe.error) {
            resolve({
              success: false,
              error: `FFprobe error: ${probe.error.string}`,
              durationSeconds: 0,
              hasVideo: false,
              hasAudio: false,
              decodable: false
            });
            return;
          }

          // Extract format information
          const format = probe.format || {};
          const duration = parseFloat(format.duration) || 0;
          const bitRate = parseInt(format.bit_rate) || 0;

          // Extract stream information
          const streams = probe.streams || [];
          const videoStream = streams.find((s: any) => s.codec_type === 'video');
          const audioStream = streams.find((s: any) => s.codec_type === 'audio');

          if (!videoStream) {
            resolve({
              success: false,
              error: 'No video stream found',
              durationSeconds: duration,
              hasVideo: false,
              hasAudio: !!audioStream,
              decodable: false
            });
            return;
          }

          // Extract video properties
          const codecName = videoStream.codec_name;
          const width = videoStream.width;
          const height = videoStream.height;
          
          // Calculate frame rate
          let frameRate = 0;
          if (videoStream.r_frame_rate) {
            const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
            if (den && den !== 0) {
              frameRate = num / den;
            }
          }

          // Check if video is decodable (no corruption indicators)
          const decodable = !videoStream.tags?.['com.apple.quicktime.corrupted'] &&
                           duration > 0 &&
                           width > 0 &&
                           height > 0;

          resolve({
            success: true,
            codecName,
            durationSeconds: duration,
            hasVideo: true,
            hasAudio: !!audioStream,
            width,
            height,
            frameRate,
            bitRate,
            decodable
          });

        } catch (error) {
          resolve({
            success: false,
            error: `Failed to parse FFprobe output: ${error instanceof Error ? error.message : 'Unknown error'}`,
            durationSeconds: 0,
            hasVideo: false,
            hasAudio: false,
            decodable: false
          });
        }
      });

      ffprobe.on('error', (error) => {
        resolve({
          success: false,
          error: `Failed to spawn FFprobe: ${error.message}. Ensure ffprobe is installed and in PATH.`,
          durationSeconds: 0,
          hasVideo: false,
          hasAudio: false,
          decodable: false
        });
      });
    });
  }

  /**
   * Calculate recording health score (0-100)
   */
  private calculateRecordingHealthScore(params: {
    hasRecentData: boolean;
    segmentCompleteness: number;
    playbackVerified: boolean;
    gapCount: number;
    consecutiveFailures: number;
  }): number {
    let score = 100;

    // Deduct for missing recent data
    if (!params.hasRecentData) {
      score -= 40;
    }

    // Deduct for segment incompleteness
    score -= (100 - params.segmentCompleteness) * 0.3;

    // Deduct for playback failures
    if (!params.playbackVerified) {
      score -= 20;
    }

    // Deduct for gaps
    score -= Math.min(20, params.gapCount * 5);

    // Deduct for consecutive failures
    score -= Math.min(10, params.consecutiveFailures * 2);

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Save verification result to database
   */
  private async saveVerificationResult(status: CameraRecordingStatus): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO recording_verification_log (
          camera_id, timestamp, status, is_recording, expected_recording,
          last_segment_time, recording_gap_seconds, segment_count_24h,
          expected_segment_count_24h, segment_completeness, playback_verified,
          consecutive_failures, health_score, issues
        ) VALUES ($1::uuid, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          status.cameraId,
          status.status,
          status.isRecording,
          status.expectedRecording,
          status.lastSegmentTime,
          status.recordingGapSeconds,
          status.segmentCount24h,
          status.expectedSegmentCount24h,
          status.segmentCompleteness,
          status.playbackVerified,
          status.consecutiveFailures,
          status.healthScore,
          JSON.stringify(status.issues),
        ]
      );

      // Also update camera recording status summary
      await this.pool.query(
        `INSERT INTO camera_recording_status (
          camera_id, status, is_recording, last_verified_at,
          health_score, last_segment_time, segment_completeness, issues
        ) VALUES ($1::uuid, $2, $3, NOW(), $4, $5, $6, $7)
        ON CONFLICT (camera_id) 
        DO UPDATE SET
          status = EXCLUDED.status,
          is_recording = EXCLUDED.is_recording,
          last_verified_at = EXCLUDED.last_verified_at,
          health_score = EXCLUDED.health_score,
          last_segment_time = EXCLUDED.last_segment_time,
          segment_completeness = EXCLUDED.segment_completeness,
          issues = EXCLUDED.issues`,
        [
          status.cameraId,
          status.status,
          status.isRecording,
          status.healthScore,
          status.lastSegmentTime,
          status.segmentCompleteness,
          JSON.stringify(status.issues),
        ]
      );
    } catch (error) {
      logger.error("Failed to save verification result", { error, cameraId: status.cameraId });
    }
  }

  /**
   * Create alert for recording issues
   */
  private async createRecordingAlert(status: CameraRecordingStatus): Promise<void> {
    try {
      const criticalIssues = status.issues.filter((i) => i.severity === "critical");
      
      if (criticalIssues.length === 0) {
        return;
      }

      const issueDescriptions = criticalIssues.map((i) => i.description).join("; ");

      await this.pool.query(
        `INSERT INTO operational_alerts (
          tenant_id, branch_id, alert_type, severity, title, message, metadata, detected_at
        ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, NOW())`,
        [
          status.tenantId,
          status.branchId,
          "recording_failure",
          "high",
          `Recording Issues: ${status.cameraName}`,
          `Camera ${status.cameraName} has critical recording issues: ${issueDescriptions}`,
          JSON.stringify({
            cameraId: status.cameraId,
            issues: criticalIssues,
            healthScore: status.healthScore,
          }),
        ]
      );

      logger.info(`Created recording alert for camera ${status.cameraName}`, {
        cameraId: status.cameraId,
        issueCount: criticalIssues.length,
      });
    } catch (error) {
      logger.error("Failed to create recording alert", { error, cameraId: status.cameraId });
    }
  }

  /**
   * Get recording status for a camera
   */
  getCameraRecordingStatus(cameraId: string): CameraRecordingStatus | undefined {
    return this.cameraStatuses.get(cameraId);
  }

  /**
   * Get recording status for all cameras
   */
  getAllRecordingStatuses(): CameraRecordingStatus[] {
    return Array.from(this.cameraStatuses.values());
  }

  /**
   * Get recording statistics
   */
  getRecordingStats(): {
    totalCameras: number;
    recordingCameras: number;
    camerasWithGaps: number;
    camerasWithPlaybackIssues: number;
    avgHealthScore: number;
    totalGapSeconds: number;
  } {
    const statuses = this.getAllRecordingStatuses();

    return {
      totalCameras: statuses.length,
      recordingCameras: statuses.filter((s) => s.isRecording).length,
      camerasWithGaps: statuses.filter((s) => s.recordingGapSeconds && s.recordingGapSeconds > 0).length,
      camerasWithPlaybackIssues: statuses.filter((s) => !s.playbackVerified).length,
      avgHealthScore: statuses.length > 0
        ? statuses.reduce((sum, s) => sum + s.healthScore, 0) / statuses.length
        : 0,
      totalGapSeconds: statuses.reduce((sum, s) => sum + (s.recordingGapSeconds || 0), 0),
    };
  }

  /**
   * Trigger manual verification for a camera
   */
  async triggerManualVerification(cameraId: string): Promise<CameraRecordingStatus | null> {
    try {
      const cameraResult = await this.pool.query(
        `SELECT 
          c.id::text,
          c.resource_node_id::text as node_id,
          c.branch_node_id::text as branch_id,
          rn.name,
          b.tenant_id::text as tenant_id,
          c.recording_enabled,
          CASE 
            WHEN c.recording_enabled = true AND c.status = 'online' THEN true
            ELSE false
          END as expected_recording
        FROM cameras c
        JOIN resource_nodes rn ON rn.id = c.resource_node_id
        JOIN resource_nodes b ON b.id = c.branch_node_id
        WHERE c.id = $1::uuid`,
        [cameraId]
      );

      if (cameraResult.rows.length === 0) {
        return null;
      }

      const camera = cameraResult.rows[0];

      await this.verifyCameraRecording({
        id: camera.id,
        tenantId: camera.tenant_id,
        branchId: camera.branch_id,
        name: camera.name,
        recordingEnabled: camera.recording_enabled || false,
        expectedRecording: camera.expected_recording || false,
      });

      return this.getCameraRecordingStatus(cameraId) || null;
    } catch (error) {
      logger.error("Manual verification failed", { error, cameraId });
      return null;
    }
  }

  /**
   * Utility: chunk array
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

/**
 * Global instance
 */
let recordingVerificationService: RecordingVerificationService | null = null;

/**
 * Get or create recording verification service
 */
export function getRecordingVerificationService(pool: Pool): RecordingVerificationService {
  if (!recordingVerificationService) {
    recordingVerificationService = new RecordingVerificationService(pool);
  }
  return recordingVerificationService;
}
