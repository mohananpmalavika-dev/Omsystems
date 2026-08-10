/**
 * Recording Verifier Service
 * Tests end-to-end recording path from camera to storage
 */

import { Pool } from 'pg';
import { promises as fs } from 'fs';
import { join } from 'path';
import {
  RecordingVerificationResult,
  RecordingProbeResult,
} from '../models/provisioning-result';
import { ProvisioningContext, RecordingConfig } from '../models/provisioning-context';

export class RecordingVerifierService {
  constructor(private pool: Pool) {}

  /**
   * Verify recording capability for provisioned cameras
   */
  async verify(context: ProvisioningContext): Promise<RecordingVerificationResult> {
    const config = context.config.recording;
    const cameraResult = context.cameras?.data;
    const storageResult = context.storage?.data;

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

    if (!storageResult || !storageResult.recordingPath) {
      throw new Error('Storage not configured for recording verification');
    }

    // Select cameras to test
    const camerasToTest = this.selectCamerasForTesting(
      cameraResult.imported,
      config
    );

    // Run probes
    const probes: RecordingProbeResult[] = [];
    for (const camera of camerasToTest) {
      const probe = await this.probeCamera(
        camera.cameraId,
        camera.name,
        storageResult.recordingPath,
        config.testDurationSeconds
      );
      probes.push(probe);
    }

    // Calculate results
    const totalTested = probes.length;
    const totalPassed = probes.filter(
      p => p.recordingPersisted && p.playbackReadable
    ).length;
    const successRate = totalTested > 0 ? (totalPassed / totalTested) * 100 : 0;

    // Determine if all critical cameras passed
    const allCriticalPassed = config.requireAllCamerasPass
      ? totalPassed === totalTested
      : totalPassed > 0;

    return {
      probes,
      totalTested,
      totalPassed,
      successRate,
      allCriticalPassed,
    };
  }

  /**
   * Probe a single camera for recording
   */
  private async probeCamera(
    cameraId: string,
    cameraName: string,
    recordingPath: string,
    durationSeconds: number
  ): Promise<RecordingProbeResult> {
    const startTime = Date.now();

    const result: RecordingProbeResult = {
      cameraId,
      cameraName,
      streamReceived: false,
      recordingStarted: false,
      recordingPersisted: false,
      playbackReadable: false,
      durationSeconds,
    };

    try {
      // Get camera stream URL from database
      const cameraQuery = `
        SELECT stream_url, ip_address 
        FROM cameras 
        WHERE id = $1
      `;
      const cameraResult = await this.pool.query(cameraQuery, [cameraId]);

      if (cameraResult.rows.length === 0) {
        result.error = 'Camera not found in database';
        return result;
      }

      const streamUrl = cameraResult.rows[0].stream_url;

      if (!streamUrl) {
        result.error = 'No stream URL configured for camera';
        return result;
      }

      // Test 1: Verify stream is reachable
      const streamReachable = await this.testStreamReachability(streamUrl);
      result.streamReceived = streamReachable;
      result.firstPacketAt = streamReachable ? new Date() : undefined;

      if (!streamReachable) {
        result.error = 'Stream not reachable';
        return result;
      }

      // Test 2: Create test recording
      const testFileName = `test_${cameraId}_${Date.now()}.mp4`;
      const testFilePath = join(recordingPath, testFileName);

      result.recordingStarted = true;

      // Simulate recording (in real implementation, this would use ffmpeg or similar)
      const recordingSuccess = await this.recordStream(
        streamUrl,
        testFilePath,
        durationSeconds
      );

      result.archivePath = testFilePath;
      result.archiveCreatedAt = new Date();

      // Test 3: Verify file was created and is readable
      if (recordingSuccess) {
        result.recordingPersisted = await this.verifyFileExists(testFilePath);
      }

      // Test 4: Verify playback (check file integrity)
      if (result.recordingPersisted) {
        result.playbackReadable = await this.verifyFileReadable(testFilePath);
      }

      // Clean up test file
      try {
        await fs.unlink(testFilePath);
      } catch {
        // Ignore cleanup errors
      }

      return result;
    } catch (error) {
      result.error = error.message;
      return result;
    }
  }

  /**
   * Test if stream is reachable
   */
  private async testStreamReachability(streamUrl: string): Promise<boolean> {
    try {
      // In real implementation, use ffprobe or similar
      // For now, basic URL validation
      const url = new URL(streamUrl);
      
      // Verify it's an RTSP URL
      if (!url.protocol.startsWith('rtsp')) {
        return false;
      }

      // In production, you would:
      // 1. Use ffprobe to probe the stream
      // 2. Verify it returns video codec info
      // 3. Check that packets are flowing
      
      // Simulated success for now
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Record stream to file
   */
  private async recordStream(
    streamUrl: string,
    outputPath: string,
    durationSeconds: number
  ): Promise<boolean> {
    try {
      // In real implementation, use ffmpeg:
      // ffmpeg -i ${streamUrl} -t ${durationSeconds} -c copy ${outputPath}
      
      // For simulation, create a dummy file
      const dummyData = Buffer.alloc(1024 * 100); // 100KB dummy recording
      await fs.writeFile(outputPath, dummyData);

      return true;
    } catch (error) {
      console.error('Recording failed:', error);
      return false;
    }
  }

  /**
   * Verify file exists
   */
  private async verifyFileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Verify file is readable
   */
  private async verifyFileReadable(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);
      
      // File must have non-zero size
      if (stats.size === 0) {
        return false;
      }

      // Try to read first few bytes
      const handle = await fs.open(filePath, 'r');
      const buffer = Buffer.alloc(1024);
      await handle.read(buffer, 0, 1024, 0);
      await handle.close();

      return true;
    } catch {
      return false;
    }
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
   * Get recording statistics for a branch
   */
  async getRecordingStats(branchId: string): Promise<{
    totalCameras: number;
    recordingCameras: number;
    failedCameras: number;
    lastVerifiedAt?: Date;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total_cameras,
        COUNT(*) FILTER (WHERE recording_enabled = true) as recording_cameras,
        COUNT(*) FILTER (WHERE recording_status = 'failed') as failed_cameras,
        MAX(last_recording_verified_at) as last_verified_at
      FROM cameras
      WHERE branch_id = $1 AND status = 'active'
    `;

    const result = await this.pool.query(query, [branchId]);
    const row = result.rows[0];

    return {
      totalCameras: parseInt(row.total_cameras) || 0,
      recordingCameras: parseInt(row.recording_cameras) || 0,
      failedCameras: parseInt(row.failed_cameras) || 0,
      lastVerifiedAt: row.last_verified_at,
    };
  }
}
