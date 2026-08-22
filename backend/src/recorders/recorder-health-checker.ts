/**
 * Recorder Health Checker
 * 
 * Orchestrates comprehensive recording compliance verification.
 * 
 * Key design principles:
 * 1. Dependency-aware execution (stop if dependency fails)
 * 2. Start all checks as UNKNOWN (fail-safe default)
 * 3. Aggregate status: unhealthy > unknown > healthy
 * 4. Isolate check failures (one failure doesn't kill all checks)
 * 5. Track last verified healthy time separately
 * 6. Calculate archive lag and clock drift
 * 7. Never fabricate timestamps or health data
 * 
 * Check dependency graph:
 * 
 *     Reachable
 *         │
 *         ▼
 *   Authentication
 *         │
 *         ▼
 *    Channel Exists
 *       /    \
 *      ▼      ▼
 *  Stream  Recording
 *              │
 *              ▼
 *          Archive
 * 
 *  Recorder
 *     │
 *     ├──── Storage
 *     └──── Clock
 */

import type { Pool } from 'pg';
import type {
  RecordingCheckResult,
  RecorderCheckError,
  ComplianceState,
  Recorder,
  CameraWithRecorder,
  CheckResult,
  ArchiveCheckResult,
  ClockCheckResult
} from './types/index.js';
import type { RecorderAdapter } from './recorder-adapter.interface.js';
import { logger } from '../utils/logger.js';

/**
 * Health check policy configuration
 */
export interface HealthCheckPolicy {
  /** Maximum archive lag in seconds before marking unhealthy */
  maxArchiveLagSeconds: number;
  
  /** Maximum clock drift in seconds before marking unhealthy */
  maxClockDriftSeconds: number;
  
  /** Storage usage percentage threshold for warning */
  storageWarningThreshold: number;
  
  /** Storage usage percentage threshold for unhealthy */
  storageUnhealthyThreshold: number;
  
  /** Required retention in days */
  requiredRetentionDays: number;
}

/**
 * Default policy for banking/NBFC (conservative)
 */
const DEFAULT_POLICY: HealthCheckPolicy = {
  maxArchiveLagSeconds: 300, // 5 minutes for continuous recording
  maxClockDriftSeconds: 60, // 1 minute drift tolerance
  storageWarningThreshold: 80, // Warn at 80%
  storageUnhealthyThreshold: 95, // Fail at 95%
  requiredRetentionDays: 180 // 180 days for banking
};

/**
 * Recorder Health Checker
 */
export class RecorderHealthChecker {
  constructor(
    private pool: Pool,
    private policy: HealthCheckPolicy = DEFAULT_POLICY
  ) {}
  
  /**
   * Perform comprehensive recording compliance check
   * 
   * Returns complete evidence-based health assessment
   */
  async check(params: {
    adapter: RecorderAdapter;
    recorder: Recorder;
    camera: CameraWithRecorder;
    policy?: Partial<HealthCheckPolicy>;
  }): Promise<RecordingCheckResult> {
    const { adapter, recorder, camera } = params;
    const policy = { ...this.policy, ...params.policy };
    
    const checkedAt = new Date();
    const errors: RecorderCheckError[] = [];
    
    logger.info('Starting recording compliance check', {
      recorderId: recorder.id,
      cameraId: camera.id,
      adapterType: adapter.getAdapterInfo().type
    });
    
    // Initialize all checks as UNKNOWN (fail-safe default)
    const result = this.createUnknownResult(recorder, camera, checkedAt, adapter);
    
    try {
      // ═══════════════════════════════════════════════════════════
      // PHASE 1: Connectivity
      // ═══════════════════════════════════════════════════════════
      
      result.reachable = await this.safeCheck(
        () => adapter.testConnection(),
        'reachable',
        errors
      );
      
      // Stop if device unreachable
      if (result.reachable.status !== 'healthy') {
        logger.warn('Recorder unreachable, skipping dependent checks', {
          recorderId: recorder.id,
          status: result.reachable.status,
          message: result.reachable.message
        });
        
        return this.finalize(result, errors, policy);
      }
      
      // ═══════════════════════════════════════════════════════════
      // PHASE 2: Authentication
      // ═══════════════════════════════════════════════════════════
      
      result.authentication = await this.safeCheck(
        () => adapter.authenticate(),
        'authentication',
        errors
      );
      
      // Stop if authentication failed
      if (result.authentication.status !== 'healthy') {
        logger.warn('Recorder authentication failed, skipping dependent checks', {
          recorderId: recorder.id,
          status: result.authentication.status
        });
        
        // Mark dependent checks as UNKNOWN with reason
        this.markDependentChecksUnknown(
          result,
          'Cannot verify without authentication'
        );
        
        return this.finalize(result, errors, policy);
      }
      
      // ═══════════════════════════════════════════════════════════
      // PHASE 3: Channel Verification
      // ═══════════════════════════════════════════════════════════
      
      if (camera.recorderChannel) {
        result.channel = await this.safeCheck(
          () => adapter.getChannel(camera.recorderChannel!),
          'channel',
          errors
        );
        
        // Stop if channel not found
        if (result.channel.status === 'unhealthy') {
          logger.warn('Recorder channel not found or disabled', {
            recorderId: recorder.id,
            cameraId: camera.id,
            channel: camera.recorderChannel
          });
          
          return this.finalize(result, errors, policy);
        }
      } else {
        result.channel = {
          status: 'unknown',
          message: 'No recorder channel configured for camera',
          errorCode: 'INVALID_CONFIGURATION',
          checkedAt
        };
      }
      
      // ═══════════════════════════════════════════════════════════
      // PHASE 4: Parallel Stream and Recording Checks
      // These are independent and can run concurrently
      // ═══════════════════════════════════════════════════════════
      
      if (camera.recorderChannel) {
        const [streamResult, recordingResult] = await Promise.all([
          this.safeCheck(
            () => adapter.getStreamStatus(camera.recorderChannel!),
            'stream',
            errors
          ),
          this.safeCheck(
            () => adapter.getRecordingStatus(camera.recorderChannel!),
            'recording',
            errors
          )
        ]);
        
        result.stream = streamResult;
        result.recording = recordingResult;
      }
      
      // ═══════════════════════════════════════════════════════════
      // PHASE 5: Archive Evidence Verification
      // CRITICAL: This verifies actual recorded footage exists
      // ═══════════════════════════════════════════════════════════
      
      if (camera.recorderChannel) {
        result.archive = await this.checkArchiveEvidence(
          adapter,
          camera.recorderChannel,
          camera.recordingMode || 'continuous',
          policy,
          errors
        );
      }
      
      // ═══════════════════════════════════════════════════════════
      // PHASE 6: Parallel Infrastructure Checks
      // Storage and clock are independent of channel
      // ═══════════════════════════════════════════════════════════
      
      const [storageResult, clockResult] = await Promise.all([
        this.safeCheck(
          () => adapter.getStorageStatus(),
          'storage',
          errors
        ),
        this.checkClockDrift(adapter, policy, errors)
      ]);
      
      result.storage = storageResult;
      result.clock = clockResult;
      
      // ═══════════════════════════════════════════════════════════
      // PHASE 7: Finalize and Aggregate
      // ═══════════════════════════════════════════════════════════
      
      return this.finalize(result, errors, policy);
      
    } catch (error) {
      logger.error('Unexpected error during health check', {
        recorderId: recorder.id,
        cameraId: camera.id,
        error
      });
      
      // Return current state with error
      errors.push({
        code: 'VENDOR_API_ERROR',
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
        checkType: 'orchestration',
        cause: error,
        timestamp: new Date()
      });
      
      return this.finalize(result, errors, policy);
    }
  }
  
  /**
   * Check archive evidence with lag calculation
   * 
   * CRITICAL: Uses actual archive timestamps, never fabricates
   */
  private async checkArchiveEvidence(
    adapter: RecorderAdapter,
    channelId: string,
    recordingMode: 'continuous' | 'motion' | 'event' | 'schedule',
    policy: HealthCheckPolicy,
    errors: RecorderCheckError[]
  ): Promise<ArchiveCheckResult> {
    const checkedAt = new Date();
    
    try {
      // Get latest and oldest recordings
      const [latestRecording, oldestRecording] = await Promise.all([
        adapter.getLatestRecording(channelId),
        adapter.getOldestRecording(channelId)
      ]);
      
      // No recordings found
      if (!latestRecording) {
        return {
          status: 'unhealthy',
          message: 'No recordings found in archive',
          errorCode: 'ARCHIVE_UNAVAILABLE',
          checkedAt
        };
      }
      
      // Calculate archive lag
      const archiveLagSeconds = Math.floor(
        (checkedAt.getTime() - latestRecording.endTime.getTime()) / 1000
      );
      
      // Calculate retention
      const retentionDays = oldestRecording
        ? Math.floor(
            (checkedAt.getTime() - oldestRecording.startTime.getTime()) /
            (1000 * 60 * 60 * 24)
          )
        : 0;
      
      const retentionCompliant = retentionDays >= policy.requiredRetentionDays;
      
      // For continuous recording, check freshness
      if (recordingMode === 'continuous') {
        if (archiveLagSeconds > policy.maxArchiveLagSeconds) {
          return {
            status: 'unhealthy',
            message: `Archive stale: last recording ${archiveLagSeconds}s ago (max ${policy.maxArchiveLagSeconds}s)`,
            errorCode: 'ARCHIVE_STALE',
            lastRecordingTime: latestRecording.endTime,
            archiveLagSeconds,
            oldestRecordingTime: oldestRecording?.startTime,
            retentionDays,
            retentionCompliant,
            requiredRetentionDays: policy.requiredRetentionDays,
            checkedAt
          };
        }
      }
      
      // Archive is current but retention insufficient
      if (!retentionCompliant) {
        return {
          status: 'unhealthy',
          message: `Retention insufficient: ${retentionDays} days (required ${policy.requiredRetentionDays})`,
          errorCode: 'RETENTION_INSUFFICIENT',
          lastRecordingTime: latestRecording.endTime,
          archiveLagSeconds,
          oldestRecordingTime: oldestRecording?.startTime,
          retentionDays,
          retentionCompliant: false,
          requiredRetentionDays: policy.requiredRetentionDays,
          checkedAt
        };
      }
      
      // Archive is healthy
      return {
        status: 'healthy',
        message: `Archive current: last recording ${archiveLagSeconds}s ago, ${retentionDays} days retention`,
        lastRecordingTime: latestRecording.endTime,
        archiveLagSeconds,
        oldestRecordingTime: oldestRecording?.startTime,
        retentionDays,
        retentionCompliant: true,
        requiredRetentionDays: policy.requiredRetentionDays,
        checkedAt
      };
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      
      errors.push({
        code: 'ARCHIVE_UNAVAILABLE',
        message: `Archive check failed: ${message}`,
        retryable: true,
        checkType: 'archive',
        cause: error,
        timestamp: new Date()
      });
      
      return {
        status: 'unknown',
        message: `Cannot verify archive: ${message}`,
        errorCode: 'ARCHIVE_UNAVAILABLE',
        checkedAt
      };
    }
  }
  
  /**
   * Check clock drift
   */
  private async checkClockDrift(
    adapter: RecorderAdapter,
    policy: HealthCheckPolicy,
    errors: RecorderCheckError[]
  ): Promise<ClockCheckResult> {
    const checkedAt = new Date();
    const platformTime = new Date();
    
    try {
      const result = await adapter.getDeviceTime();
      
      if (result.status !== 'healthy' || !result.value) {
        return {
          status: result.status,
          message: result.message || 'Cannot read device time',
          errorCode: result.errorCode,
          checkedAt
        };
      }
      
      const recorderTime = result.value;
      const driftSeconds = Math.floor(
        (recorderTime.getTime() - platformTime.getTime()) / 1000
      );
      const absDriftSeconds = Math.abs(driftSeconds);
      
      if (absDriftSeconds > policy.maxClockDriftSeconds) {
        return {
          status: 'unhealthy',
          message: `Clock drift ${absDriftSeconds}s exceeds ${policy.maxClockDriftSeconds}s`,
          errorCode: 'CLOCK_DRIFT',
          recorderTime,
          platformTime,
          driftSeconds,
          checkedAt
        };
      }
      
      return {
        status: 'healthy',
        message: `Clock drift ${absDriftSeconds}s within tolerance`,
        recorderTime,
        platformTime,
        driftSeconds,
        checkedAt
      };
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      
      errors.push({
        code: 'VENDOR_API_ERROR',
        message: `Clock check failed: ${message}`,
        retryable: true,
        checkType: 'clock',
        cause: error,
        timestamp: new Date()
      });
      
      return {
        status: 'unknown',
        message: `Cannot verify clock: ${message}`,
        checkedAt
      };
    }
  }
  
  /**
   * Safe check execution with error isolation
   */
  private async safeCheck<T extends CheckResult>(
    operation: () => Promise<T>,
    checkName: string,
    errors: RecorderCheckError[]
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      
      logger.error(`Check ${checkName} failed`, { error });
      
      errors.push({
        code: 'VENDOR_API_ERROR',
        message: `${checkName} check failed: ${message}`,
        retryable: true,
        checkType: checkName,
        cause: error,
        timestamp: new Date()
      });
      
      return {
        status: 'unknown',
        message: `Check failed: ${message}`,
        errorCode: 'VENDOR_API_ERROR',
        checkedAt: new Date()
      } as T;
    }
  }
  
  /**
   * Create initial UNKNOWN result (fail-safe default)
   */
  private createUnknownResult(
    recorder: Recorder,
    camera: CameraWithRecorder,
    checkedAt: Date,
    adapter: RecorderAdapter
  ): RecordingCheckResult {
    const unknown = (message = 'Not verified'): CheckResult => ({
      status: 'unknown',
      message,
      checkedAt
    });
    
    const adapterInfo = adapter.getAdapterInfo();
    
    return {
      overallStatus: 'unknown',
      recorderId: recorder.id,
      channelId: camera.recorderChannel,
      checkedAt,
      
      reachable: unknown('Device reachability not verified'),
      authentication: unknown('Authentication not verified'),
      channel: unknown('Channel not verified'),
      stream: unknown('Stream status not verified'),
      recording: unknown('Recording status not verified'),
      archive: unknown('Archive not verified'),
      storage: unknown('Storage not verified'),
      clock: unknown('Clock not verified'),
      
      errors: [],
      adapterType: adapterInfo.type,
      adapterVersion: adapterInfo.version
    };
  }
  
  /**
   * Mark dependent checks as UNKNOWN when dependency failed
   */
  private markDependentChecksUnknown(
    result: RecordingCheckResult,
    reason: string
  ): void {
    const checkedAt = new Date();
    
    result.channel = {
      status: 'unknown',
      message: reason,
      checkedAt
    };
    
    result.stream = {
      status: 'unknown',
      message: reason,
      checkedAt
    };
    
    result.recording = {
      status: 'unknown',
      message: reason,
      checkedAt
    };
    
    result.archive = {
      status: 'unknown',
      message: reason,
      checkedAt
    };
  }
  
  /**
   * Finalize result with aggregation and metadata
   */
  private async finalize(
    result: RecordingCheckResult,
    errors: RecorderCheckError[],
    policy: HealthCheckPolicy
  ): Promise<RecordingCheckResult> {
    // Aggregate overall status
    result.overallStatus = this.aggregateStatus(result);
    
    // Attach errors
    result.errors = errors;
    
    // Get last verified healthy time from database
    result.lastVerifiedHealthyAt = await this.getLastVerifiedHealthyTime(
      result.recorderId,
      result.channelId
    );
    
    // Calculate result age
    result.resultAgeSeconds = 0; // Current check
    
    logger.info('Recording compliance check complete', {
      recorderId: result.recorderId,
      channelId: result.channelId,
      overallStatus: result.overallStatus,
      errorCount: errors.length
    });
    
    return result;
  }
  
  /**
   * Aggregate check statuses into overall status
   * 
   * Priority: unhealthy > unknown > healthy
   * 
   * Rules:
   * - Any UNHEALTHY → overall UNHEALTHY
   * - No UNHEALTHY but any UNKNOWN → overall UNKNOWN
   * - All HEALTHY → overall HEALTHY
   */
  private aggregateStatus(result: RecordingCheckResult): ComplianceState {
    const checks = [
      result.reachable,
      result.authentication,
      result.channel,
      result.stream,
      result.recording,
      result.archive,
      result.storage,
      result.clock
    ];
    
    // Any unhealthy = overall unhealthy
    if (checks.some(check => check.status === 'unhealthy')) {
      return 'unhealthy';
    }
    
    // Any unknown = overall unknown
    if (checks.some(check => check.status === 'unknown')) {
      return 'unknown';
    }
    
    // All healthy = overall healthy
    return 'healthy';
  }
  
  /**
   * Get last time this recorder was verified healthy
   */
  private async getLastVerifiedHealthyTime(
    recorderId: string,
    channelId?: string
  ): Promise<Date | undefined> {
    try {
      const result = await this.pool.query(
        `SELECT checked_at
         FROM recording_compliance_checks
         WHERE recorder_id = $1::uuid
           AND ($2::text IS NULL OR channel_id = $2)
           AND overall_status = 'healthy'
         ORDER BY checked_at DESC
         LIMIT 1`,
        [recorderId, channelId]
      );
      
      if (result.rows.length > 0) {
        return new Date(result.rows[0].checked_at);
      }
      
      return undefined;
      
    } catch (error) {
      logger.error('Failed to get last verified healthy time', {
        recorderId,
        channelId,
        error
      });
      return undefined;
    }
  }
}
