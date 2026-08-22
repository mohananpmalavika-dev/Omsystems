/**
 * Recorder Evidence Evaluator
 * 
 * Evaluates evidence and produces assessments.
 * 
 * CRITICAL: This is where POLICY lives, not in adapters.
 * 
 * Responsibilities:
 * - Evaluate evidence freshness
 * - Detect conflicts between observations
 * - Calculate operational status
 * - Provide assessment reasons
 * 
 * This does NOT acquire evidence - only interprets it.
 */

import type {
  RecorderEvidence,
  ChannelEvidence,
  RecordingSegment
} from '../contracts/recorder-evidence.js';
import type { EvidenceValue, EvidenceFreshness } from '../contracts/evidence-value.js';
import { calculateFreshness, DEFAULT_FRESHNESS_THRESHOLDS, isObserved } from '../contracts/evidence-value.js';
import { logger } from '../../utils/logger.js';

/**
 * Operational status
 */
export type OperationalStatus =
  | 'HEALTHY'      // All systems operating normally
  | 'DEGRADED'     // Operating with issues
  | 'FAILED'       // Critical failure
  | 'UNKNOWN';     // Cannot determine status

/**
 * Recording compliance status
 */
export type RecordingComplianceStatus =
  | 'COMPLIANT'         // Recording as expected
  | 'NON_COMPLIANT'     // Not recording or recording gap
  | 'UNKNOWN'           // Cannot verify
  | 'NOT_APPLICABLE';   // Channel disabled/not configured

/**
 * Assessment reason codes
 */
export type AssessmentReason =
  // Connectivity
  | 'UNREACHABLE'
  | 'AUTH_FAILED'
  | 'TIMEOUT'
  
  // Evidence quality
  | 'STALE_EVIDENCE'
  | 'EXPIRED_EVIDENCE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'CONFLICTING_EVIDENCE'
  
  // Operational issues
  | 'STREAM_OFFLINE'
  | 'NO_VIDEO_SIGNAL'
  | 'RECORDING_DISABLED'
  | 'RECORDING_STOPPED'
  | 'NO_RECENT_ARCHIVE'
  | 'ARCHIVE_GAP'
  | 'STORAGE_FULL'
  | 'STORAGE_DEGRADED'
  | 'DISK_FAILED'
  | 'CLOCK_SKEW'
  
  // Configuration
  | 'CHANNEL_DISABLED'
  | 'UNSUPPORTED_FEATURE';

/**
 * Recorder assessment
 */
export interface RecorderAssessment {
  recorderId: string;
  assessedAt: Date;
  
  /**
   * Overall operational status
   */
  status: OperationalStatus;
  
  /**
   * Reason codes
   */
  reasons: AssessmentReason[];
  
  /**
   * Evidence freshness
   */
  evidenceFreshness: EvidenceFreshness;
  
  /**
   * Channel assessments
   */
  channels: ChannelAssessment[];
  
  /**
   * Storage assessment
   */
  storage?: StorageAssessment;
  
  /**
   * Device health indicators
   */
  health: {
    reachable: boolean;
    authenticated: boolean;
    clockSkewSeconds: number;
    storageUsagePercent?: number;
  };
}

/**
 * Channel assessment
 */
export interface ChannelAssessment {
  channelId: string;
  status: OperationalStatus;
  recordingCompliance: RecordingComplianceStatus;
  reasons: AssessmentReason[];
  
  /**
   * Evidence summary
   */
  evidence: {
    enabled: boolean | null;
    streamOnline: boolean | null;
    videoPresent: boolean | null;
    recordingActive: boolean | null;
    latestRecordingAge?: number; // seconds
    archiveVerified: boolean | null;
  };
}

/**
 * Storage assessment
 */
export interface StorageAssessment {
  status: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
  usagePercent: number;
  freeBytes: number;
  reasons: AssessmentReason[];
  failedDisks: number;
}

/**
 * Freshness thresholds for assessments
 */
const ASSESSMENT_FRESHNESS_MS = {
  ACCEPTABLE: 5 * 60 * 1000,  // 5 minutes
  STALE: 30 * 60 * 1000,      // 30 minutes
};

/**
 * Recording gap threshold (seconds)
 */
const RECORDING_GAP_THRESHOLD_SECONDS = 5 * 60; // 5 minutes

/**
 * Clock skew threshold (seconds)
 */
const CLOCK_SKEW_THRESHOLD_SECONDS = 5 * 60; // 5 minutes

/**
 * Storage thresholds
 */
const STORAGE_WARNING_PERCENT = 80;
const STORAGE_CRITICAL_PERCENT = 95;

/**
 * Recorder Evidence Evaluator
 */
export class RecorderEvidenceEvaluator {
  /**
   * Evaluate complete recorder evidence
   */
  evaluateRecorder(evidence: RecorderEvidence): RecorderAssessment {
    const now = new Date();
    const reasons: AssessmentReason[] = [];

    // Check evidence freshness
    const evidenceFreshness = calculateFreshness(
      evidence.collectedAt,
      now,
      {
        freshMs: ASSESSMENT_FRESHNESS_MS.ACCEPTABLE,
        staleMs: ASSESSMENT_FRESHNESS_MS.STALE
      }
    );

    if (evidenceFreshness === 'STALE') {
      reasons.push('STALE_EVIDENCE');
    } else if (evidenceFreshness === 'EXPIRED') {
      reasons.push('EXPIRED_EVIDENCE');
    }

    // Check reachability
    const reachable = isObserved(evidence.reachable) 
      ? evidence.reachable.value 
      : false;

    if (!reachable) {
      reasons.push('UNREACHABLE');
    }

    // Check authentication
    const authenticated = isObserved(evidence.authenticated)
      ? evidence.authenticated.value
      : false;

    if (!authenticated && reachable) {
      reasons.push('AUTH_FAILED');
    }

    // Check clock skew
    let clockSkewSeconds = 0;
    if (isObserved(evidence.deviceTime)) {
      clockSkewSeconds = Math.abs(evidence.deviceTime.value.offsetMs / 1000);
      
      if (clockSkewSeconds > CLOCK_SKEW_THRESHOLD_SECONDS) {
        reasons.push('CLOCK_SKEW');
      }
    }

    // Evaluate storage
    let storageAssessment: StorageAssessment | undefined;
    let storageUsagePercent: number | undefined;
    
    if (isObserved(evidence.storage)) {
      storageAssessment = this.evaluateStorage(evidence.storage.value);
      storageUsagePercent = evidence.storage.value.usagePercent;
      
      reasons.push(...storageAssessment.reasons);
    }

    // Evaluate channels
    let channelAssessments: ChannelAssessment[] = [];
    if (isObserved(evidence.channels)) {
      channelAssessments = evidence.channels.value.map(channel =>
        this.evaluateChannel(channel, now)
      );
    }

    // Determine overall status
    const status = this.determineOverallStatus(
      reachable,
      authenticated,
      channelAssessments,
      storageAssessment,
      reasons
    );

    return {
      recorderId: evidence.recorderId,
      assessedAt: now,
      status,
      reasons,
      evidenceFreshness,
      channels: channelAssessments,
      storage: storageAssessment,
      health: {
        reachable,
        authenticated,
        clockSkewSeconds,
        storageUsagePercent
      }
    };
  }

  /**
   * Evaluate single channel
   */
  evaluateChannel(
    channel: ChannelEvidence,
    now: Date = new Date()
  ): ChannelAssessment {
    const reasons: AssessmentReason[] = [];

    // Extract evidence values
    const enabled = isObserved(channel.enabled) ? channel.enabled.value : null;
    const streamOnline = isObserved(channel.streamReachable) ? channel.streamReachable.value : null;
    const videoPresent = isObserved(channel.videoPresent) ? channel.videoPresent.value : null;
    const recordingActive = isObserved(channel.recordingActive) ? channel.recordingActive.value : null;
    const archiveVerified = isObserved(channel.archivePlayable) ? channel.archivePlayable.value : null;

    // Calculate latest recording age
    let latestRecordingAge: number | undefined;
    if (isObserved(channel.latestRecordingAt)) {
      latestRecordingAge = Math.floor(
        (now.getTime() - channel.latestRecordingAt.value.getTime()) / 1000
      );
    }

    // Check if channel is disabled
    if (enabled === false) {
      reasons.push('CHANNEL_DISABLED');
      
      return {
        channelId: channel.channelId,
        status: 'UNKNOWN',
        recordingCompliance: 'NOT_APPLICABLE',
        reasons,
        evidence: {
          enabled,
          streamOnline,
          videoPresent,
          recordingActive,
          latestRecordingAge,
          archiveVerified
        }
      };
    }

    // Check stream status
    if (streamOnline === false) {
      reasons.push('STREAM_OFFLINE');
    }

    if (videoPresent === false) {
      reasons.push('NO_VIDEO_SIGNAL');
    }

    // Check recording status
    if (recordingActive === false) {
      reasons.push('RECORDING_STOPPED');
    }

    // Check recording age
    if (
      latestRecordingAge !== undefined &&
      latestRecordingAge > RECORDING_GAP_THRESHOLD_SECONDS
    ) {
      reasons.push('NO_RECENT_ARCHIVE');
    }

    // Determine operational status
    let status: OperationalStatus = 'HEALTHY';
    
    if (streamOnline === false || videoPresent === false) {
      status = 'FAILED';
    } else if (reasons.length > 0) {
      status = 'DEGRADED';
    } else if (
      streamOnline === null ||
      videoPresent === null ||
      recordingActive === null
    ) {
      status = 'UNKNOWN';
    }

    // Determine recording compliance
    let recordingCompliance: RecordingComplianceStatus = 'COMPLIANT';
    
    if (enabled === false) {
      recordingCompliance = 'NOT_APPLICABLE';
    } else if (
      recordingActive === false ||
      (latestRecordingAge && latestRecordingAge > RECORDING_GAP_THRESHOLD_SECONDS)
    ) {
      recordingCompliance = 'NON_COMPLIANT';
    } else if (recordingActive === null && latestRecordingAge === undefined) {
      recordingCompliance = 'UNKNOWN';
    }

    return {
      channelId: channel.channelId,
      status,
      recordingCompliance,
      reasons,
      evidence: {
        enabled,
        streamOnline,
        videoPresent,
        recordingActive,
        latestRecordingAge,
        archiveVerified
      }
    };
  }

  /**
   * Evaluate storage
   */
  private evaluateStorage(storage: any): StorageAssessment {
    const reasons: AssessmentReason[] = [];
    
    const usagePercent = storage.usagePercent ?? 0;
    const freeBytes = storage.freeBytes ?? 0;

    // Check storage capacity
    let status: StorageAssessment['status'] = 'NORMAL';
    
    if (usagePercent >= STORAGE_CRITICAL_PERCENT) {
      status = 'CRITICAL';
      reasons.push('STORAGE_FULL');
    } else if (usagePercent >= STORAGE_WARNING_PERCENT) {
      status = 'WARNING';
      reasons.push('STORAGE_DEGRADED');
    }

    // Check disk failures
    const failedDisks = storage.disks?.filter((disk: any) =>
      disk.state === 'failed'
    ).length ?? 0;

    if (failedDisks > 0) {
      status = status === 'NORMAL' ? 'WARNING' : status;
      reasons.push('DISK_FAILED');
    }

    return {
      status,
      usagePercent,
      freeBytes,
      reasons,
      failedDisks
    };
  }

  /**
   * Determine overall operational status
   */
  private determineOverallStatus(
    reachable: boolean,
    authenticated: boolean,
    channels: ChannelAssessment[],
    storage?: StorageAssessment,
    reasons: AssessmentReason[] = []
  ): OperationalStatus {
    // Critical failures
    if (!reachable) {
      return 'FAILED';
    }

    if (!authenticated) {
      return 'FAILED';
    }

    // Storage critical
    if (storage?.status === 'CRITICAL') {
      return 'DEGRADED';
    }

    // Check channel status
    const channelStatuses = channels.map(c => c.status);
    
    if (channelStatuses.some(s => s === 'FAILED')) {
      return 'DEGRADED';
    }

    if (channelStatuses.every(s => s === 'UNKNOWN')) {
      return 'UNKNOWN';
    }

    if (
      reasons.length > 0 ||
      storage?.status === 'WARNING' ||
      channelStatuses.some(s => s === 'DEGRADED')
    ) {
      return 'DEGRADED';
    }

    if (channelStatuses.every(s => s === 'HEALTHY')) {
      return 'HEALTHY';
    }

    return 'UNKNOWN';
  }

  /**
   * Detect evidence conflicts
   * 
   * Identifies when different sources report conflicting information.
   */
  detectConflicts(evidence: RecorderEvidence): Array<{
    type: 'channel_status' | 'recording_status' | 'archive_mismatch';
    channelId?: string;
    description: string;
    sources: string[];
  }> {
    const conflicts: Array<any> = [];

    if (!isObserved(evidence.channels)) {
      return conflicts;
    }

    for (const channel of evidence.channels.value) {
      // Detect recording vs archive mismatch
      const recordingActive = isObserved(channel.recordingActive) 
        ? channel.recordingActive.value 
        : null;
      
      const latestRecordingAt = isObserved(channel.latestRecordingAt)
        ? channel.latestRecordingAt.value
        : null;

      if (
        recordingActive === true &&
        latestRecordingAt &&
        (Date.now() - latestRecordingAt.getTime()) > RECORDING_GAP_THRESHOLD_SECONDS * 1000
      ) {
        conflicts.push({
          type: 'archive_mismatch',
          channelId: channel.channelId,
          description: 'Recording reported active but no recent archive found',
          sources: [
            channel.recordingActive.source.adapter,
            channel.latestRecordingAt.source.adapter
          ]
        });
      }
    }

    return conflicts;
  }

  /**
   * Calculate recording compliance score (0-100)
   */
  calculateComplianceScore(channels: ChannelAssessment[]): number {
    if (channels.length === 0) {
      return 0;
    }

    const compliantCount = channels.filter(
      c => c.recordingCompliance === 'COMPLIANT'
    ).length;

    return Math.round((compliantCount / channels.length) * 100);
  }
}
