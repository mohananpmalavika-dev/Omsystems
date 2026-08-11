/**
 * Retention Policy Repository
 * 
 * Persistence layer for recording retention policies with versioning.
 */

import type { Pool } from 'pg';
import { logger } from '../../utils/logger.js';
import type {
  RecordingRetentionPolicy,
  PolicyChangeRecord
} from '../compliance/compliance.types.js';

/**
 * Retention Policy Repository
 */
export class RetentionPolicyRepository {
  constructor(private readonly pool: Pool) {}
  
  /**
   * Create a new retention policy
   */
  async create(policy: Omit<RecordingRetentionPolicy, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<RecordingRetentionPolicy> {
    try {
      const result = await this.pool.query(
        `INSERT INTO recording_retention_policy (
          tenant_id,
          name,
          description,
          version,
          effective_from,
          effective_until,
          scope_branch_ids,
          scope_camera_ids,
          scope_camera_tags,
          required_retention_days,
          max_recording_gap_minutes,
          require_continuous_recording,
          minimum_coverage_ratio,
          minimum_evidence_confidence,
          max_evidence_age_minutes,
          minimum_evidence_level,
          max_clock_drift_seconds,
          alert_on_indeterminate,
          enforcement_level,
          created_by,
          created_at,
          updated_at
        ) VALUES (
          $1::uuid, $2, $3, 1, $4, $5,
          $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
          $19, NOW(), NOW()
        )
        RETURNING 
          id::text,
          tenant_id::text,
          name,
          description,
          version,
          effective_from,
          effective_until,
          scope_branch_ids::text[],
          scope_camera_ids::text[],
          scope_camera_tags,
          required_retention_days,
          max_recording_gap_minutes,
          require_continuous_recording,
          minimum_coverage_ratio,
          minimum_evidence_confidence,
          max_evidence_age_minutes,
          minimum_evidence_level,
          max_clock_drift_seconds,
          alert_on_indeterminate,
          enforcement_level,
          created_by,
          created_at,
          updated_at`,
        [
          policy.tenantId,
          policy.name,
          policy.description,
          policy.effectiveFrom,
          policy.effectiveUntil,
          policy.scope.branchIds,
          policy.scope.cameraIds,
          policy.scope.cameraTags,
          policy.requiredRetentionDays,
          policy.maxRecordingGapMinutes,
          policy.requireContinuousRecording,
          policy.minimumCoverageRatio,
          policy.minimumEvidenceConfidence,
          policy.maxEvidenceAgeMinutes,
          policy.minimumEvidenceLevel,
          policy.maxClockDriftSeconds,
          policy.alertOnIndeterminate,
          policy.enforcementLevel,
          policy.createdBy
        ]
      );
      
      return this.mapRowToPolicy(result.rows[0]);
    } catch (error) {
      logger.error('Failed to create retention policy', {
        error,
        tenantId: policy.tenantId,
        name: policy.name
      });
      throw error;
    }
  }
  
  /**
   * Update an existing policy (creates new version)
   */
  async update(
    policyId: string,
    updates: Partial<Omit<RecordingRetentionPolicy, 'id' | 'tenantId' | 'version'>>,
    updatedBy: string
  ): Promise<RecordingRetentionPolicy> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get current policy
      const currentResult = await client.query(
        `SELECT * FROM recording_retention_policy WHERE id = $1::uuid`,
        [policyId]
      );
      
      if (currentResult.rows.length === 0) {
        throw new Error(`Policy ${policyId} not found`);
      }
      
      const current = this.mapRowToPolicy(currentResult.rows[0]);
      
      // Archive current version
      await client.query(
        `INSERT INTO recording_retention_policy_history 
        SELECT * FROM recording_retention_policy WHERE id = $1::uuid`,
        [policyId]
      );
      
      // Record changes
      const changes = this.detectChanges(current, updates);
      if (changes.length > 0) {
        await client.query(
          `INSERT INTO policy_change_record (
            policy_id,
            from_version,
            to_version,
            changes,
            changed_by,
            changed_at
          ) VALUES ($1::uuid, $2, $3, $4, $5, NOW())`,
          [policyId, current.version, current.version + 1, JSON.stringify(changes), updatedBy]
        );
      }
      
      // Update policy with new version
      const newVersion = current.version + 1;
      const result = await client.query(
        `UPDATE recording_retention_policy SET
          name = COALESCE($2, name),
          description = COALESCE($3, description),
          version = $4,
          effective_from = COALESCE($5, effective_from),
          effective_until = COALESCE($6, effective_until),
          scope_branch_ids = COALESCE($7, scope_branch_ids),
          scope_camera_ids = COALESCE($8, scope_camera_ids),
          scope_camera_tags = COALESCE($9, scope_camera_tags),
          required_retention_days = COALESCE($10, required_retention_days),
          max_recording_gap_minutes = COALESCE($11, max_recording_gap_minutes),
          require_continuous_recording = COALESCE($12, require_continuous_recording),
          minimum_coverage_ratio = COALESCE($13, minimum_coverage_ratio),
          minimum_evidence_confidence = COALESCE($14, minimum_evidence_confidence),
          max_evidence_age_minutes = COALESCE($15, max_evidence_age_minutes),
          minimum_evidence_level = COALESCE($16, minimum_evidence_level),
          max_clock_drift_seconds = COALESCE($17, max_clock_drift_seconds),
          alert_on_indeterminate = COALESCE($18, alert_on_indeterminate),
          enforcement_level = COALESCE($19, enforcement_level),
          updated_at = NOW()
        WHERE id = $1::uuid
        RETURNING *`,
        [
          policyId,
          updates.name,
          updates.description,
          newVersion,
          updates.effectiveFrom,
          updates.effectiveUntil,
          updates.scope?.branchIds,
          updates.scope?.cameraIds,
          updates.scope?.cameraTags,
          updates.requiredRetentionDays,
          updates.maxRecordingGapMinutes,
          updates.requireContinuousRecording,
          updates.minimumCoverageRatio,
          updates.minimumEvidenceConfidence,
          updates.maxEvidenceAgeMinutes,
          updates.minimumEvidenceLevel,
          updates.maxClockDriftSeconds,
          updates.alertOnIndeterminate,
          updates.enforcementLevel
        ]
      );
      
      await client.query('COMMIT');
      
      return this.mapRowToPolicy(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to update retention policy', {
        error,
        policyId
      });
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get policy by ID
   */
  async getById(policyId: string): Promise<RecordingRetentionPolicy | null> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM recording_retention_policy WHERE id = $1::uuid`,
        [policyId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToPolicy(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get policy by ID', { error, policyId });
      throw error;
    }
  }
  
  /**
   * Find applicable policy for a camera
   * 
   * Matches policies by scope (branch, camera, tags) and effective date.
   */
  async findApplicablePolicy(
    tenantId: string,
    cameraId: string,
    now: Date = new Date()
  ): Promise<RecordingRetentionPolicy | null> {
    try {
      // Get camera details
      const cameraResult = await this.pool.query(
        `SELECT 
          c.id::text as camera_id,
          c.branch_node_id::text as branch_id,
          COALESCE(c.tags, '{}') as tags
        FROM cameras c
        WHERE c.id = $1::uuid`,
        [cameraId]
      );
      
      if (cameraResult.rows.length === 0) {
        return null;
      }
      
      const camera = cameraResult.rows[0];
      
      // Find most specific applicable policy
      const result = await this.pool.query(
        `SELECT * FROM recording_retention_policy
        WHERE tenant_id = $1::uuid
          AND effective_from <= $2
          AND (effective_until IS NULL OR effective_until >= $2)
          AND (
            -- Specific camera match
            (scope_camera_ids IS NOT NULL AND $3::text = ANY(scope_camera_ids))
            OR
            -- Branch match
            (scope_branch_ids IS NOT NULL AND $4::text = ANY(scope_branch_ids))
            OR
            -- Tag match
            (scope_camera_tags IS NOT NULL AND scope_camera_tags && $5::text[])
            OR
            -- Tenant-wide default (no specific scope)
            (scope_camera_ids IS NULL AND scope_branch_ids IS NULL AND scope_camera_tags IS NULL)
          )
        ORDER BY
          -- Most specific first
          CASE
            WHEN scope_camera_ids IS NOT NULL AND $3::text = ANY(scope_camera_ids) THEN 1
            WHEN scope_branch_ids IS NOT NULL AND $4::text = ANY(scope_branch_ids) THEN 2
            WHEN scope_camera_tags IS NOT NULL THEN 3
            ELSE 4
          END,
          created_at DESC
        LIMIT 1`,
        [tenantId, now, cameraId, camera.branch_id, camera.tags]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToPolicy(result.rows[0]);
    } catch (error) {
      logger.error('Failed to find applicable policy', {
        error,
        tenantId,
        cameraId
      });
      throw error;
    }
  }
  
  /**
   * Get all policies for a tenant
   */
  async getByTenant(tenantId: string): Promise<RecordingRetentionPolicy[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM recording_retention_policy
        WHERE tenant_id = $1::uuid
        ORDER BY created_at DESC`,
        [tenantId]
      );
      
      return result.rows.map(row => this.mapRowToPolicy(row));
    } catch (error) {
      logger.error('Failed to get policies by tenant', { error, tenantId });
      throw error;
    }
  }
  
  /**
   * Get policy history
   */
  async getHistory(policyId: string): Promise<RecordingRetentionPolicy[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM recording_retention_policy_history
        WHERE id = $1::uuid
        ORDER BY version DESC`,
        [policyId]
      );
      
      return result.rows.map(row => this.mapRowToPolicy(row));
    } catch (error) {
      logger.error('Failed to get policy history', { error, policyId });
      throw error;
    }
  }
  
  /**
   * Get policy change records
   */
  async getChangeRecords(policyId: string): Promise<PolicyChangeRecord[]> {
    try {
      const result = await this.pool.query(
        `SELECT 
          id::text,
          policy_id::text,
          from_version,
          to_version,
          changes,
          changed_by,
          changed_at,
          reason
        FROM policy_change_record
        WHERE policy_id = $1::uuid
        ORDER BY changed_at DESC`,
        [policyId]
      );
      
      return result.rows.map(row => ({
        id: row.id,
        policyId: row.policy_id,
        fromVersion: row.from_version,
        toVersion: row.to_version,
        changes: JSON.parse(row.changes),
        changedBy: row.changed_by,
        changedAt: new Date(row.changed_at),
        reason: row.reason
      }));
    } catch (error) {
      logger.error('Failed to get policy change records', { error, policyId });
      throw error;
    }
  }
  
  /**
   * Delete policy
   */
  async delete(policyId: string): Promise<void> {
    try {
      await this.pool.query(
        `DELETE FROM recording_retention_policy WHERE id = $1::uuid`,
        [policyId]
      );
    } catch (error) {
      logger.error('Failed to delete policy', { error, policyId });
      throw error;
    }
  }
  
  /**
   * Map database row to policy object
   */
  private mapRowToPolicy(row: any): RecordingRetentionPolicy {
    return {
      id: row.id,
      version: row.version,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description,
      effectiveFrom: new Date(row.effective_from),
      effectiveUntil: row.effective_until ? new Date(row.effective_until) : null,
      scope: {
        branchIds: row.scope_branch_ids,
        cameraIds: row.scope_camera_ids,
        cameraTags: row.scope_camera_tags
      },
      requiredRetentionDays: parseInt(row.required_retention_days),
      maxRecordingGapMinutes: parseInt(row.max_recording_gap_minutes),
      requireContinuousRecording: row.require_continuous_recording,
      minimumCoverageRatio: row.minimum_coverage_ratio ? parseFloat(row.minimum_coverage_ratio) : undefined,
      minimumEvidenceConfidence: parseFloat(row.minimum_evidence_confidence),
      maxEvidenceAgeMinutes: parseInt(row.max_evidence_age_minutes),
      minimumEvidenceLevel: row.minimum_evidence_level,
      maxClockDriftSeconds: row.max_clock_drift_seconds,
      alertOnIndeterminate: row.alert_on_indeterminate,
      enforcementLevel: row.enforcement_level,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
  
  /**
   * Detect changes between policies
   */
  private detectChanges(
    current: RecordingRetentionPolicy,
    updates: Partial<RecordingRetentionPolicy>
  ): Array<{ field: string; oldValue: unknown; newValue: unknown }> {
    const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
    
    const fields: Array<keyof RecordingRetentionPolicy> = [
      'name',
      'description',
      'requiredRetentionDays',
      'maxRecordingGapMinutes',
      'requireContinuousRecording',
      'minimumCoverageRatio',
      'minimumEvidenceConfidence',
      'maxEvidenceAgeMinutes',
      'minimumEvidenceLevel',
      'maxClockDriftSeconds',
      'alertOnIndeterminate',
      'enforcementLevel'
    ];
    
    for (const field of fields) {
      if (updates[field] !== undefined && updates[field] !== current[field]) {
        changes.push({
          field,
          oldValue: current[field],
          newValue: updates[field]
        });
      }
    }
    
    return changes;
  }
}
