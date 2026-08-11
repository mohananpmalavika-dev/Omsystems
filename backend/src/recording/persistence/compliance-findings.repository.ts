/**
 * Compliance Findings Repository
 * 
 * Persistence layer for compliance evaluation results.
 * Links findings to evidence snapshots and policy versions.
 */

import type { Pool } from 'pg';
import { createHash } from 'crypto';
import { logger } from '../../utils/logger.js';
import type {
  ComplianceFinding,
  ComplianceSummary,
  ComplianceAuditRecord,
  ComplianceState
} from '../compliance/compliance.types.js';

/**
 * Compliance Findings Repository
 */
export class ComplianceFindingsRepository {
  constructor(private readonly pool: Pool) {}
  
  /**
   * Save compliance finding
   */
  async save(finding: ComplianceFinding): Promise<ComplianceFinding> {
    try {
      const result = await this.pool.query(
        `INSERT INTO recording_compliance_finding (
          tenant_id,
          policy_id,
          policy_version,
          policy_name,
          camera_id,
          camera_name,
          recorder_id,
          recorder_name,
          state,
          reason,
          reason_code,
          evaluated_at,
          evidence_snapshot_id,
          evidence_status,
          evidence_verified_at,
          evidence_age_seconds,
          requirements_json,
          observed_json,
          violations_json,
          compliance_score,
          next_evaluation_at,
          metadata_json,
          created_at
        ) VALUES (
          $1::uuid, $2::uuid, $3, $4, $5::uuid, $6, $7::uuid, $8,
          $9, $10, $11, $12, $13::uuid, $14, $15, $16,
          $17, $18, $19, $20, $21, $22, NOW()
        )
        RETURNING id::text`,
        [
          finding.tenantId,
          finding.policyId,
          finding.policyVersion,
          finding.policyName,
          finding.cameraId,
          finding.cameraName,
          finding.recorderId,
          finding.recorderName,
          finding.state,
          finding.reason,
          finding.reasonCode,
          finding.evaluatedAt,
          finding.evidenceSnapshotId,
          finding.evidenceStatus,
          finding.evidenceVerifiedAt,
          finding.evidenceAgeSeconds,
          JSON.stringify(finding.requirements),
          JSON.stringify(finding.observed),
          JSON.stringify(finding.violations),
          finding.complianceScore,
          finding.nextEvaluationAt,
          finding.metadata ? JSON.stringify(finding.metadata) : null
        ]
      );
      
      // Create audit record
      await this.createAuditRecord({
        ...finding,
        id: result.rows[0].id
      });
      
      return {
        ...finding,
        id: result.rows[0].id
      };
    } catch (error) {
      logger.error('Failed to save compliance finding', {
        error,
        cameraId: finding.cameraId,
        policyId: finding.policyId
      });
      throw error;
    }
  }
  
  /**
   * Get latest finding for a camera
   */
  async getLatest(
    tenantId: string,
    cameraId: string
  ): Promise<ComplianceFinding | null> {
    try {
      const result = await this.pool.query(
        `SELECT 
          id::text,
          tenant_id::text,
          policy_id::text,
          policy_version,
          policy_name,
          camera_id::text,
          camera_name,
          recorder_id::text,
          recorder_name,
          state,
          reason,
          reason_code,
          evaluated_at,
          evidence_snapshot_id::text,
          evidence_status,
          evidence_verified_at,
          evidence_age_seconds,
          requirements_json,
          observed_json,
          violations_json,
          compliance_score,
          next_evaluation_at,
          metadata_json,
          created_at
        FROM recording_compliance_finding
        WHERE tenant_id = $1::uuid
          AND camera_id = $2::uuid
        ORDER BY evaluated_at DESC
        LIMIT 1`,
        [tenantId, cameraId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToFinding(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get latest finding', {
        error,
        tenantId,
        cameraId
      });
      throw error;
    }
  }
  
  /**
   * Get finding by ID
   */
  async getById(id: string): Promise<ComplianceFinding | null> {
    try {
      const result = await this.pool.query(
        `SELECT 
          id::text,
          tenant_id::text,
          policy_id::text,
          policy_version,
          policy_name,
          camera_id::text,
          camera_name,
          recorder_id::text,
          recorder_name,
          state,
          reason,
          reason_code,
          evaluated_at,
          evidence_snapshot_id::text,
          evidence_status,
          evidence_verified_at,
          evidence_age_seconds,
          requirements_json,
          observed_json,
          violations_json,
          compliance_score,
          next_evaluation_at,
          metadata_json,
          created_at
        FROM recording_compliance_finding
        WHERE id = $1::uuid`,
        [id]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToFinding(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get finding by ID', { error, id });
      throw error;
    }
  }
  
  /**
   * Get compliance summary for a scope
   */
  async getSummary(
    tenantId: string,
    branchId?: string,
    policyId?: string,
    periodStart?: Date,
    periodEnd?: Date
  ): Promise<ComplianceSummary> {
    try {
      const now = periodEnd || new Date();
      const start = periodStart || new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      // Get latest findings for each camera in scope
      const result = await this.pool.query(
        `WITH latest_findings AS (
          SELECT DISTINCT ON (camera_id)
            f.*
          FROM recording_compliance_finding f
          JOIN cameras c ON c.id = f.camera_id
          WHERE f.tenant_id = $1::uuid
            AND ($2::uuid IS NULL OR c.branch_node_id = $2::uuid)
            AND ($3::uuid IS NULL OR f.policy_id = $3::uuid)
            AND f.evaluated_at >= $4
            AND f.evaluated_at <= $5
          ORDER BY camera_id, evaluated_at DESC
        )
        SELECT 
          COUNT(*) as total_cameras,
          COUNT(*) FILTER (WHERE state = 'COMPLIANT') as compliant,
          COUNT(*) FILTER (WHERE state = 'NON_COMPLIANT') as non_compliant,
          COUNT(*) FILTER (WHERE state = 'INDETERMINATE') as indeterminate,
          COUNT(*) FILTER (WHERE state = 'NOT_APPLICABLE') as not_applicable,
          AVG(compliance_score) as avg_score,
          COUNT(*) FILTER (WHERE state = 'INDETERMINATE') as cannot_verify,
          AVG((observed_json->>'retentionDays')::numeric) as avg_retention_days,
          MIN((observed_json->>'retentionDays')::numeric) as min_retention_days,
          COUNT(*) FILTER (WHERE 
            (observed_json->>'retentionDays')::numeric < (requirements_json->>'retentionDays')::numeric
          ) as below_retention_requirement,
          AVG((observed_json->>'coverage')::numeric) as avg_coverage_ratio,
          SUM(jsonb_array_length(violations_json)) as total_gaps
        FROM latest_findings`,
        [tenantId, branchId, policyId, start, now]
      );
      
      const stats = result.rows[0];
      
      // Get top violations
      const violationsResult = await this.pool.query(
        `WITH latest_findings AS (
          SELECT DISTINCT ON (camera_id)
            f.*
          FROM recording_compliance_finding f
          JOIN cameras c ON c.id = f.camera_id
          WHERE f.tenant_id = $1::uuid
            AND ($2::uuid IS NULL OR c.branch_node_id = $2::uuid)
            AND ($3::uuid IS NULL OR f.policy_id = $3::uuid)
            AND f.evaluated_at >= $4
            AND f.evaluated_at <= $5
          ORDER BY camera_id, evaluated_at DESC
        ),
        violations AS (
          SELECT jsonb_array_elements(violations_json) as violation
          FROM latest_findings
        )
        SELECT 
          violation->>'code' as code,
          COUNT(*) as count
        FROM violations
        GROUP BY violation->>'code'
        ORDER BY count DESC
        LIMIT 10`,
        [tenantId, branchId, policyId, start, now]
      );
      
      // Get indeterminate reasons
      const reasonsResult = await this.pool.query(
        `WITH latest_findings AS (
          SELECT DISTINCT ON (camera_id)
            f.*
          FROM recording_compliance_finding f
          JOIN cameras c ON c.id = f.camera_id
          WHERE f.tenant_id = $1::uuid
            AND ($2::uuid IS NULL OR c.branch_node_id = $2::uuid)
            AND ($3::uuid IS NULL OR f.policy_id = $3::uuid)
            AND f.evaluated_at >= $4
            AND f.evaluated_at <= $5
            AND f.state = 'INDETERMINATE'
          ORDER BY camera_id, evaluated_at DESC
        )
        SELECT 
          reason_code,
          COUNT(*) as count
        FROM latest_findings
        WHERE reason_code IS NOT NULL
        GROUP BY reason_code
        ORDER BY count DESC`,
        [tenantId, branchId, policyId, start, now]
      );
      
      const totalCameras = parseInt(stats.total_cameras) || 0;
      const compliant = parseInt(stats.compliant) || 0;
      const nonCompliant = parseInt(stats.non_compliant) || 0;
      const indeterminate = parseInt(stats.indeterminate) || 0;
      const notApplicable = parseInt(stats.not_applicable) || 0;
      
      const applicableCameras = totalCameras - notApplicable;
      const complianceRate = applicableCameras > 0 
        ? (compliant / applicableCameras) * 100 
        : 100;
      
      const topViolations = violationsResult.rows.map(row => ({
        code: row.code,
        count: parseInt(row.count),
        percentage: totalCameras > 0 ? (parseInt(row.count) / totalCameras) * 100 : 0
      }));
      
      const cannotVerifyByReason: Record<string, number> = {};
      for (const row of reasonsResult.rows) {
        cannotVerifyByReason[row.reason_code] = parseInt(row.count);
      }
      
      return {
        tenantId,
        branchId,
        policyId,
        period: {
          start,
          end: now
        },
        totalCameras,
        byState: {
          compliant,
          nonCompliant,
          indeterminate,
          notApplicable
        },
        complianceRate,
        averageScore: parseFloat(stats.avg_score) || 0,
        cannotVerify: {
          total: indeterminate,
          byReason: cannotVerifyByReason
        },
        topViolations,
        retention: {
          averageDays: parseFloat(stats.avg_retention_days) || 0,
          minimumDays: parseFloat(stats.min_retention_days) || 0,
          belowRequirement: parseInt(stats.below_retention_requirement) || 0
        },
        coverage: {
          averageRatio: parseFloat(stats.avg_coverage_ratio) || 0,
          totalGaps: parseInt(stats.total_gaps) || 0,
          largestGapMinutes: 0 // Would need separate query
        },
        lastUpdated: now
      };
    } catch (error) {
      logger.error('Failed to get compliance summary', {
        error,
        tenantId,
        branchId,
        policyId
      });
      throw error;
    }
  }
  
  /**
   * Get findings by state
   */
  async getByState(
    tenantId: string,
    state: ComplianceState,
    limit: number = 100
  ): Promise<ComplianceFinding[]> {
    try {
      const result = await this.pool.query(
        `SELECT 
          id::text,
          tenant_id::text,
          policy_id::text,
          policy_version,
          policy_name,
          camera_id::text,
          camera_name,
          recorder_id::text,
          recorder_name,
          state,
          reason,
          reason_code,
          evaluated_at,
          evidence_snapshot_id::text,
          evidence_status,
          evidence_verified_at,
          evidence_age_seconds,
          requirements_json,
          observed_json,
          violations_json,
          compliance_score,
          next_evaluation_at,
          metadata_json,
          created_at
        FROM recording_compliance_finding
        WHERE tenant_id = $1::uuid
          AND state = $2
        ORDER BY evaluated_at DESC
        LIMIT $3`,
        [tenantId, state, limit]
      );
      
      return result.rows.map(row => this.mapRowToFinding(row));
    } catch (error) {
      logger.error('Failed to get findings by state', {
        error,
        tenantId,
        state
      });
      throw error;
    }
  }
  
  /**
   * Create audit record
   */
  private async createAuditRecord(finding: ComplianceFinding): Promise<void> {
    try {
      const findingHash = this.calculateHash(finding);
      
      await this.pool.query(
        `INSERT INTO compliance_audit_record (
          finding_id,
          policy_version,
          evidence_snapshot_id,
          state,
          evaluated_at,
          finding_hash,
          created_at
        ) VALUES (
          $1::uuid, $2, $3::uuid, $4, $5, $6, NOW()
        )`,
        [
          finding.id,
          finding.policyVersion,
          finding.evidenceSnapshotId,
          finding.state,
          finding.evaluatedAt,
          findingHash
        ]
      );
    } catch (error) {
      logger.error('Failed to create audit record', {
        error,
        findingId: finding.id
      });
      // Don't throw - audit failure shouldn't block finding save
    }
  }
  
  /**
   * Get audit records for a finding
   */
  async getAuditRecords(findingId: string): Promise<ComplianceAuditRecord[]> {
    try {
      const result = await this.pool.query(
        `SELECT 
          id::text,
          finding_id::text,
          policy_version,
          evidence_snapshot_id::text,
          state,
          evaluated_at,
          evaluated_by,
          evidence_hash,
          finding_hash,
          created_at
        FROM compliance_audit_record
        WHERE finding_id = $1::uuid
        ORDER BY created_at DESC`,
        [findingId]
      );
      
      return result.rows.map(row => ({
        id: row.id,
        findingId: row.finding_id,
        policyVersion: row.policy_version,
        evidenceSnapshotId: row.evidence_snapshot_id,
        state: row.state,
        evaluatedAt: new Date(row.evaluated_at),
        evaluatedBy: row.evaluated_by,
        evidenceHash: row.evidence_hash,
        findingHash: row.finding_hash,
        createdAt: new Date(row.created_at)
      }));
    } catch (error) {
      logger.error('Failed to get audit records', { error, findingId });
      throw error;
    }
  }
  
  /**
   * Delete old findings
   */
  async deleteOlderThan(days: number): Promise<number> {
    try {
      const result = await this.pool.query(
        `DELETE FROM recording_compliance_finding
        WHERE created_at < NOW() - INTERVAL '${days} days'`,
        []
      );
      
      return result.rowCount || 0;
    } catch (error) {
      logger.error('Failed to delete old findings', { error, days });
      throw error;
    }
  }
  
  /**
   * Map database row to finding
   */
  private mapRowToFinding(row: any): ComplianceFinding {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      policyId: row.policy_id,
      policyVersion: row.policy_version,
      policyName: row.policy_name,
      cameraId: row.camera_id,
      cameraName: row.camera_name,
      recorderId: row.recorder_id,
      recorderName: row.recorder_name,
      state: row.state,
      reason: row.reason,
      reasonCode: row.reason_code,
      evaluatedAt: new Date(row.evaluated_at),
      evidenceSnapshotId: row.evidence_snapshot_id,
      evidenceStatus: row.evidence_status,
      evidenceVerifiedAt: row.evidence_verified_at ? new Date(row.evidence_verified_at) : null,
      evidenceAgeSeconds: row.evidence_age_seconds,
      requirements: JSON.parse(row.requirements_json),
      observed: JSON.parse(row.observed_json),
      violations: JSON.parse(row.violations_json),
      complianceScore: row.compliance_score,
      nextEvaluationAt: row.next_evaluation_at ? new Date(row.next_evaluation_at) : undefined,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
      createdAt: new Date(row.created_at)
    };
  }
  
  /**
   * Calculate finding hash for audit trail
   */
  private calculateHash(finding: ComplianceFinding): string {
    const payload = JSON.stringify({
      policyId: finding.policyId,
      policyVersion: finding.policyVersion,
      cameraId: finding.cameraId,
      state: finding.state,
      evidenceSnapshotId: finding.evidenceSnapshotId,
      evaluatedAt: finding.evaluatedAt
    });
    
    return createHash('sha256').update(payload).digest('hex');
  }
}
