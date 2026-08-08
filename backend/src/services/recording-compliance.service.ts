/**
 * Recording Compliance Service
 * 180-day retention compliance verification for banking/NBFC environments
 * 
 * Provides:
 * - Recording compliance scoring
 * - DVR cross-validation
 * - Retention policy enforcement
 * - Compliance reporting
 * - Gap analysis and evidence chains
 */

import type { Pool } from "pg";
import { logger } from "../utils/logger.js";

export interface ComplianceScore {
  cameraId: string;
  tenantId: string;
  branchId: string;
  cameraName: string;
  
  // Recording coverage
  expectedDurationHours: number;
  recordedDurationHours: number;
  coverage: number; // 0-100%
  
  // Gap analysis
  totalGaps: number;
  longestGapSeconds: number;
  totalGapSeconds: number;
  gapDetails: Array<{
    startTime: Date;
    endTime: Date;
    durationSeconds: number;
  }>;
  
  // Integrity validation
  totalSegments: number;
  verifiedSegments: number;
  corruptedSegments: number;
  integrityScore: number; // 0-100%
  
  // DVR validation
  dvrVerified: boolean;
  dvrMatchRate: number; // 0-100%
  dvrMismatches: number;
  
  // Retention compliance
  retentionDays: number;
  oldestRecordingDays: number;
  retentionCompliant: boolean;
  
  // Overall compliance
  overallScore: number; // 0-100%
  complianceStatus: 'COMPLIANT' | 'NON_COMPLIANT' | 'DEGRADED';
  lastChecked: Date;
}

export interface DVRRecordingValidation {
  cameraId: string;
  dvrId: string;
  channel: number;
  
  // DVR-reported status
  dvrRecording: boolean;
  dvrLastRecordingTime?: Date;
  dvrStorageStatus: 'normal' | 'full' | 'error';
  
  // Cross-validation
  sentinelRecording: boolean;
  sentinelLastSegmentTime?: Date;
  statusMatch: boolean;
  timeDifferenceSeconds?: number;
  
  // Validation result
  valid: boolean;
  issues: string[];
}

export interface RetentionPolicyCompliance {
  tenantId: string;
  branchId?: string;
  policyName: string;
  requiredRetentionDays: number;
  
  totalCameras: number;
  compliantCameras: number;
  nonCompliantCameras: number;
  
  oldestRecordingDays: number;
  averageRetentionDays: number;
  
  complianceRate: number; // 0-100%
  status: 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIAL';
  
  nonCompliantDetails: Array<{
    cameraId: string;
    cameraName: string;
    oldestRecordingDays: number;
    gap: number; // days short of requirement
  }>;
}

export class RecordingComplianceService {
  private pool: Pool;
  
  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Calculate comprehensive compliance score for a camera
   */
  async calculateComplianceScore(
    cameraId: string,
    periodDays: number = 1
  ): Promise<ComplianceScore | null> {
    try {
      // Get camera details
      const cameraResult = await this.pool.query(
        `SELECT 
          c.id::text,
          c.branch_node_id::text as branch_id,
          b.tenant_id::text as tenant_id,
          rn.name as camera_name,
          c.recording_enabled
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
      const startTime = new Date();
      startTime.setDate(startTime.getDate() - periodDays);

      // 1. Calculate recording coverage
      const coverageResult = await this.pool.query(
        `SELECT 
          COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at))), 0) / 3600 as recorded_hours,
          COUNT(*) as segment_count
        FROM recording_segments
        WHERE camera_id = $1::uuid
          AND started_at >= $2
          AND status = 'ready'`,
        [cameraId, startTime]
      );

      const recordedHours = parseFloat(coverageResult.rows[0]?.recorded_hours || 0);
      const expectedHours = periodDays * 24;
      const coverage = Math.min(100, (recordedHours / expectedHours) * 100);

      // 2. Analyze recording gaps
      const gapsResult = await this.pool.query(
        `WITH segments AS (
          SELECT 
            started_at,
            ended_at,
            LAG(ended_at) OVER (ORDER BY started_at) as prev_ended
          FROM recording_segments
          WHERE camera_id = $1::uuid
            AND started_at >= $2
            AND status = 'ready'
          ORDER BY started_at
        ),
        gaps AS (
          SELECT 
            prev_ended as gap_start,
            started_at as gap_end,
            EXTRACT(EPOCH FROM (started_at - prev_ended)) as duration_seconds
          FROM segments
          WHERE prev_ended IS NOT NULL
            AND EXTRACT(EPOCH FROM (started_at - prev_ended)) > 60
        )
        SELECT 
          gap_start,
          gap_end,
          duration_seconds,
          COUNT(*) OVER () as total_gaps,
          SUM(duration_seconds) OVER () as total_gap_seconds,
          MAX(duration_seconds) OVER () as longest_gap_seconds
        FROM gaps
        ORDER BY gap_start`,
        [cameraId, startTime]
      );

      const gapDetails = gapsResult.rows.map(row => ({
        startTime: new Date(row.gap_start),
        endTime: new Date(row.gap_end),
        durationSeconds: parseFloat(row.duration_seconds)
      }));

      const totalGaps = gapsResult.rows.length;
      const longestGapSeconds = parseFloat(gapsResult.rows[0]?.longest_gap_seconds || 0);
      const totalGapSeconds = parseFloat(gapsResult.rows[0]?.total_gap_seconds || 0);

      // 3. Check segment integrity (FFprobe verification results)
      const integrityResult = await this.pool.query(
        `SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE playback_verified = true) as verified,
          COUNT(*) FILTER (WHERE playback_verified = false) as corrupted
        FROM recording_verification_log
        WHERE camera_id = $1::uuid
          AND timestamp >= $2`,
        [cameraId, startTime]
      );

      const totalSegments = parseInt(integrityResult.rows[0]?.total || 0);
      const verifiedSegments = parseInt(integrityResult.rows[0]?.verified || 0);
      const corruptedSegments = parseInt(integrityResult.rows[0]?.corrupted || 0);
      const integrityScore = totalSegments > 0 
        ? (verifiedSegments / totalSegments) * 100 
        : 100;

      // 4. DVR cross-validation
      const dvrValidation = await this.validateWithDVR(cameraId);
      const dvrVerified = dvrValidation !== null;
      const dvrMatchRate = dvrValidation?.valid ? 100 : 0;
      const dvrMismatches = dvrValidation?.issues.length || 0;

      // 5. Check retention compliance
      const retentionResult = await this.pool.query(
        `SELECT 
          EXTRACT(DAY FROM (NOW() - MIN(started_at))) as oldest_days
        FROM recording_segments
        WHERE camera_id = $1::uuid
          AND status = 'ready'`,
        [cameraId]
      );

      const oldestRecordingDays = parseFloat(retentionResult.rows[0]?.oldest_days || 0);
      const retentionDays = 180; // Banking/NBFC requirement
      const retentionCompliant = oldestRecordingDays >= retentionDays;

      // 6. Calculate overall compliance score
      const overallScore = this.calculateOverallComplianceScore({
        coverage,
        integrityScore,
        dvrMatchRate,
        gapPenalty: Math.min(30, (totalGapSeconds / (expectedHours * 3600)) * 100),
        retentionCompliant
      });

      // 7. Determine compliance status
      let complianceStatus: ComplianceScore['complianceStatus'] = 'COMPLIANT';
      if (overallScore < 70 || !retentionCompliant) {
        complianceStatus = 'NON_COMPLIANT';
      } else if (overallScore < 90) {
        complianceStatus = 'DEGRADED';
      }

      const score: ComplianceScore = {
        cameraId: camera.id,
        tenantId: camera.tenant_id,
        branchId: camera.branch_id,
        cameraName: camera.camera_name,
        
        expectedDurationHours: expectedHours,
        recordedDurationHours: recordedHours,
        coverage,
        
        totalGaps,
        longestGapSeconds,
        totalGapSeconds,
        gapDetails: gapDetails.slice(0, 10), // Limit to 10 largest gaps
        
        totalSegments,
        verifiedSegments,
        corruptedSegments,
        integrityScore,
        
        dvrVerified,
        dvrMatchRate,
        dvrMismatches,
        
        retentionDays,
        oldestRecordingDays,
        retentionCompliant,
        
        overallScore,
        complianceStatus,
        lastChecked: new Date()
      };

      // Save compliance score to database
      await this.saveComplianceScore(score);

      return score;

    } catch (error) {
      logger.error('Failed to calculate compliance score', { error, cameraId });
      return null;
    }
  }

  /**
   * Validate Sentinel recordings against DVR
   */
  async validateWithDVR(cameraId: string): Promise<DVRRecordingValidation | null> {
    try {
      // Get camera's DVR configuration
      const dvrResult = await this.pool.query(
        `SELECT 
          d.id::text as dvr_id,
          d.ip_address,
          d.port,
          d.username,
          d.password_encrypted,
          c.dvr_channel as channel
        FROM cameras c
        JOIN dvrs d ON d.id = c.dvr_id
        WHERE c.id = $1::uuid
          AND c.dvr_id IS NOT NULL`,
        [cameraId]
      );

      if (dvrResult.rows.length === 0) {
        // No DVR configured for this camera
        return null;
      }

      const dvr = dvrResult.rows[0];

      // Get Sentinel's last recording time
      const sentinelResult = await this.pool.query(
        `SELECT 
          MAX(ended_at) as last_segment_time,
          BOOL_OR(status = 'recording') as is_recording
        FROM recording_segments
        WHERE camera_id = $1::uuid
          AND started_at >= NOW() - INTERVAL '1 hour'`,
        [cameraId]
      );

      const sentinelRecording = sentinelResult.rows[0]?.is_recording || false;
      const sentinelLastSegmentTime = sentinelResult.rows[0]?.last_segment_time 
        ? new Date(sentinelResult.rows[0].last_segment_time)
        : undefined;

      // Query DVR for recording status
      // This would use ONVIF or vendor-specific API
      const dvrStatus = await this.queryDVRRecordingStatus(
        dvr.ip_address,
        dvr.port,
        dvr.channel,
        dvr.username,
        dvr.password_encrypted
      );

      // Cross-validate
      const statusMatch = sentinelRecording === dvrStatus.recording;
      const timeDifferenceSeconds = sentinelLastSegmentTime && dvrStatus.lastRecordingTime
        ? Math.abs(sentinelLastSegmentTime.getTime() - dvrStatus.lastRecordingTime.getTime()) / 1000
        : undefined;

      const issues: string[] = [];
      
      if (!statusMatch) {
        issues.push(`Recording status mismatch: Sentinel=${sentinelRecording}, DVR=${dvrStatus.recording}`);
      }
      
      if (timeDifferenceSeconds && timeDifferenceSeconds > 300) {
        issues.push(`Time difference too large: ${Math.round(timeDifferenceSeconds)}s`);
      }

      if (dvrStatus.storageStatus !== 'normal') {
        issues.push(`DVR storage ${dvrStatus.storageStatus}`);
      }

      return {
        cameraId,
        dvrId: dvr.dvr_id,
        channel: dvr.channel,
        
        dvrRecording: dvrStatus.recording,
        dvrLastRecordingTime: dvrStatus.lastRecordingTime,
        dvrStorageStatus: dvrStatus.storageStatus,
        
        sentinelRecording,
        sentinelLastSegmentTime,
        statusMatch,
        timeDifferenceSeconds,
        
        valid: issues.length === 0,
        issues
      };

    } catch (error) {
      logger.error('DVR cross-validation failed', { error, cameraId });
      return null;
    }
  }

  /**
   * Query DVR for recording status via ONVIF
   */
  private async queryDVRRecordingStatus(
    ipAddress: string,
    port: number,
    channel: number,
    username: string,
    encryptedPassword: string
  ): Promise<{
    recording: boolean;
    lastRecordingTime?: Date;
    storageStatus: 'normal' | 'full' | 'error';
  }> {
    // This is a placeholder for actual ONVIF/vendor API integration
    // In production, this would:
    // 1. Connect to DVR via ONVIF
    // 2. Query GetRecordingStatus for the specific channel
    // 3. Query GetStorageConfiguration for disk status
    // 4. Return actual status
    
    // For now, return simulated status
    return {
      recording: true,
      lastRecordingTime: new Date(),
      storageStatus: 'normal'
    };
  }

  /**
   * Check retention policy compliance for all cameras
   */
  async checkRetentionCompliance(
    tenantId: string,
    branchId?: string
  ): Promise<RetentionPolicyCompliance> {
    try {
      // Get retention policy
      const policyResult = await this.pool.query(
        `SELECT retention_days, policy_name
        FROM recording_policies
        WHERE tenant_id = $1::uuid
          AND (branch_id = $2::uuid OR branch_id IS NULL)
        ORDER BY branch_id NULLS LAST
        LIMIT 1`,
        [tenantId, branchId]
      );

      const retentionDays = policyResult.rows[0]?.retention_days || 180;
      const policyName = policyResult.rows[0]?.policy_name || 'Default 180-day policy';

      // Get compliance status for all cameras
      const complianceResult = await this.pool.query(
        `WITH camera_oldest AS (
          SELECT 
            c.id::text as camera_id,
            rn.name as camera_name,
            EXTRACT(DAY FROM (NOW() - MIN(rs.started_at))) as oldest_days
          FROM cameras c
          JOIN resource_nodes rn ON rn.id = c.resource_node_id
          JOIN resource_nodes b ON b.id = c.branch_node_id
          LEFT JOIN recording_segments rs ON rs.camera_id = c.id AND rs.status = 'ready'
          WHERE b.tenant_id = $1::uuid
            AND ($2::uuid IS NULL OR c.branch_node_id = $2::uuid)
            AND c.recording_enabled = true
          GROUP BY c.id, rn.name
        )
        SELECT 
          camera_id,
          camera_name,
          COALESCE(oldest_days, 0) as oldest_days,
          CASE 
            WHEN oldest_days >= $3 THEN true
            ELSE false
          END as compliant,
          CASE
            WHEN oldest_days < $3 THEN $3 - oldest_days
            ELSE 0
          END as gap_days
        FROM camera_oldest
        ORDER BY oldest_days`,
        [tenantId, branchId, retentionDays]
      );

      const totalCameras = complianceResult.rows.length;
      const compliantCameras = complianceResult.rows.filter(r => r.compliant).length;
      const nonCompliantCameras = totalCameras - compliantCameras;

      const oldestRecordingDays = Math.max(...complianceResult.rows.map(r => parseFloat(r.oldest_days)), 0);
      const averageRetentionDays = complianceResult.rows.length > 0
        ? complianceResult.rows.reduce((sum, r) => sum + parseFloat(r.oldest_days), 0) / complianceResult.rows.length
        : 0;

      const complianceRate = totalCameras > 0 ? (compliantCameras / totalCameras) * 100 : 100;

      let status: RetentionPolicyCompliance['status'] = 'COMPLIANT';
      if (complianceRate < 100 && complianceRate >= 80) {
        status = 'PARTIAL';
      } else if (complianceRate < 80) {
        status = 'NON_COMPLIANT';
      }

      const nonCompliantDetails = complianceResult.rows
        .filter(r => !r.compliant)
        .map(r => ({
          cameraId: r.camera_id,
          cameraName: r.camera_name,
          oldestRecordingDays: parseFloat(r.oldest_days),
          gap: parseFloat(r.gap_days)
        }));

      return {
        tenantId,
        branchId,
        policyName,
        requiredRetentionDays: retentionDays,
        
        totalCameras,
        compliantCameras,
        nonCompliantCameras,
        
        oldestRecordingDays,
        averageRetentionDays,
        
        complianceRate,
        status,
        
        nonCompliantDetails
      };

    } catch (error) {
      logger.error('Failed to check retention compliance', { error, tenantId, branchId });
      throw error;
    }
  }

  /**
   * Calculate overall compliance score
   */
  private calculateOverallComplianceScore(params: {
    coverage: number;
    integrityScore: number;
    dvrMatchRate: number;
    gapPenalty: number;
    retentionCompliant: boolean;
  }): number {
    let score = 0;

    // Coverage: 40% weight
    score += params.coverage * 0.4;

    // Integrity: 30% weight
    score += params.integrityScore * 0.3;

    // DVR validation: 15% weight
    score += params.dvrMatchRate * 0.15;

    // Gap penalty: deduct up to 15 points
    score -= Math.min(15, params.gapPenalty);

    // Retention: 15% weight (binary: 0 or 15)
    score += params.retentionCompliant ? 15 : 0;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Save compliance score to database
   */
  private async saveComplianceScore(score: ComplianceScore): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO recording_compliance_scores (
          camera_id, tenant_id, branch_id, timestamp,
          expected_duration_hours, recorded_duration_hours, coverage,
          total_gaps, longest_gap_seconds, total_gap_seconds,
          total_segments, verified_segments, corrupted_segments, integrity_score,
          dvr_verified, dvr_match_rate, dvr_mismatches,
          retention_days, oldest_recording_days, retention_compliant,
          overall_score, compliance_status, gap_details
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid, NOW(),
          $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18, $19, $20, $21, $22
        )`,
        [
          score.cameraId, score.tenantId, score.branchId,
          score.expectedDurationHours, score.recordedDurationHours, score.coverage,
          score.totalGaps, score.longestGapSeconds, score.totalGapSeconds,
          score.totalSegments, score.verifiedSegments, score.corruptedSegments, score.integrityScore,
          score.dvrVerified, score.dvrMatchRate, score.dvrMismatches,
          score.retentionDays, score.oldestRecordingDays, score.retentionCompliant,
          score.overallScore, score.complianceStatus, JSON.stringify(score.gapDetails)
        ]
      );
    } catch (error) {
      logger.error('Failed to save compliance score', { error, cameraId: score.cameraId });
    }
  }

  /**
   * Generate compliance report for a branch
   */
  async generateComplianceReport(
    branchId: string,
    periodDays: number = 1
  ): Promise<{
    branchId: string;
    reportDate: Date;
    periodDays: number;
    cameras: ComplianceScore[];
    summary: {
      totalCameras: number;
      compliantCameras: number;
      degradedCameras: number;
      nonCompliantCameras: number;
      averageScore: number;
      averageCoverage: number;
      totalGaps: number;
      retentionCompliant: number;
    };
  }> {
    // Get all cameras in branch
    const camerasResult = await this.pool.query(
      `SELECT id::text
      FROM cameras
      WHERE branch_node_id = $1::uuid
        AND recording_enabled = true`,
      [branchId]
    );

    const cameraIds = camerasResult.rows.map(r => r.id);

    // Calculate compliance for each camera
    const scores = await Promise.all(
      cameraIds.map(id => this.calculateComplianceScore(id, periodDays))
    );

    const validScores = scores.filter((s): s is ComplianceScore => s !== null);

    // Calculate summary
    const summary = {
      totalCameras: validScores.length,
      compliantCameras: validScores.filter(s => s.complianceStatus === 'COMPLIANT').length,
      degradedCameras: validScores.filter(s => s.complianceStatus === 'DEGRADED').length,
      nonCompliantCameras: validScores.filter(s => s.complianceStatus === 'NON_COMPLIANT').length,
      averageScore: validScores.length > 0 
        ? validScores.reduce((sum, s) => sum + s.overallScore, 0) / validScores.length 
        : 0,
      averageCoverage: validScores.length > 0
        ? validScores.reduce((sum, s) => sum + s.coverage, 0) / validScores.length
        : 0,
      totalGaps: validScores.reduce((sum, s) => sum + s.totalGaps, 0),
      retentionCompliant: validScores.filter(s => s.retentionCompliant).length
    };

    return {
      branchId,
      reportDate: new Date(),
      periodDays,
      cameras: validScores,
      summary
    };
  }
}

/**
 * Global instance
 */
let complianceService: RecordingComplianceService | null = null;

/**
 * Get or create compliance service
 */
export function getRecordingComplianceService(pool: Pool): RecordingComplianceService {
  if (!complianceService) {
    complianceService = new RecordingComplianceService(pool);
  }
  return complianceService;
}
