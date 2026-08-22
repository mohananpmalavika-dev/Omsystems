/**
 * Recording Evidence Repository
 * 
 * Persistence layer for recording evidence snapshots.
 * Stores raw evidence separately from compliance findings.
 */

import type { Pool } from 'pg';
import { logger } from '../../utils/logger.js';
import type {
  RecordingEvidence,
  RecordingEvidenceQuery,
  DailyCoverageSummary
} from '../evidence/recording-evidence.types.js';

/**
 * Recording Evidence Repository
 */
export class RecordingEvidenceRepository {
  constructor(private readonly pool: Pool) {}
  
  /**
   * Save evidence snapshot
   */
  async save(evidence: RecordingEvidence): Promise<RecordingEvidence> {
    try {
      const result = await this.pool.query(
        `INSERT INTO recording_evidence_snapshot (
          tenant_id,
          recorder_id,
          camera_id,
          recording_state,
          latest_recording_at,
          oldest_recording_at,
          retention_days,
          storage_status,
          storage_total_bytes,
          storage_used_bytes,
          storage_free_bytes,
          storage_usage_percent,
          verification_status,
          verified_at,
          expires_at,
          source,
          method,
          confidence,
          latency_ms,
          reason,
          checks_json,
          coverage_json,
          details_json,
          raw_payload_hash,
          created_at
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7,
          $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25
        )
        RETURNING id::text`,
        [
          evidence.tenantId,
          evidence.recorderId,
          evidence.channelId,
          evidence.recordingState,
          evidence.latestRecordingAt,
          evidence.oldestRecordingAt,
          evidence.retentionDays,
          evidence.storage.status,
          evidence.storage.totalBytes,
          evidence.storage.usedBytes,
          evidence.storage.freeBytes,
          evidence.storage.usagePercent,
          evidence.verification.status,
          evidence.verification.verifiedAt,
          evidence.verification.expiresAt,
          evidence.verification.source,
          evidence.verification.method,
          evidence.verification.confidence,
          evidence.verification.latencyMs,
          evidence.reason,
          JSON.stringify(evidence.checks),
          evidence.coverage ? JSON.stringify(evidence.coverage) : null,
          evidence.details ? JSON.stringify(evidence.details) : null,
          evidence.rawPayloadHash,
          evidence.createdAt || new Date()
        ]
      );
      
      return {
        ...evidence,
        id: result.rows[0].id
      };
    } catch (error) {
      logger.error('Failed to save evidence snapshot', {
        error,
        recorderId: evidence.recorderId,
        channelId: evidence.channelId
      });
      throw error;
    }
  }
  
  /**
   * Get latest evidence for a camera
   */
  async getLatest(
    tenantId: string,
    cameraId: string
  ): Promise<RecordingEvidence | null> {
    try {
      const result = await this.pool.query(
        `SELECT 
          id::text,
          tenant_id::text,
          recorder_id::text,
          camera_id::text,
          recording_state,
          latest_recording_at,
          oldest_recording_at,
          retention_days,
          storage_status,
          storage_total_bytes,
          storage_used_bytes,
          storage_free_bytes,
          storage_usage_percent,
          verification_status,
          verified_at,
          expires_at,
          source,
          method,
          confidence,
          latency_ms,
          reason,
          checks_json,
          coverage_json,
          details_json,
          raw_payload_hash,
          created_at
        FROM recording_evidence_snapshot
        WHERE tenant_id = $1::uuid
          AND camera_id = $2::uuid
        ORDER BY created_at DESC
        LIMIT 1`,
        [tenantId, cameraId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToEvidence(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get latest evidence', {
        error,
        tenantId,
        cameraId
      });
      throw error;
    }
  }
  
  /**
   * Get evidence by ID
   */
  async getById(id: string): Promise<RecordingEvidence | null> {
    try {
      const result = await this.pool.query(
        `SELECT 
          id::text,
          tenant_id::text,
          recorder_id::text,
          camera_id::text,
          recording_state,
          latest_recording_at,
          oldest_recording_at,
          retention_days,
          storage_status,
          storage_total_bytes,
          storage_used_bytes,
          storage_free_bytes,
          storage_usage_percent,
          verification_status,
          verified_at,
          expires_at,
          source,
          method,
          confidence,
          latency_ms,
          reason,
          checks_json,
          coverage_json,
          details_json,
          raw_payload_hash,
          created_at
        FROM recording_evidence_snapshot
        WHERE id = $1::uuid`,
        [id]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToEvidence(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get evidence by ID', {
        error,
        id
      });
      throw error;
    }
  }
  
  /**
   * Query evidence with filters
   */
  async query(query: RecordingEvidenceQuery): Promise<RecordingEvidence[]> {
    try {
      let sql = `
        SELECT 
          id::text,
          tenant_id::text,
          recorder_id::text,
          camera_id::text,
          recording_state,
          latest_recording_at,
          oldest_recording_at,
          retention_days,
          storage_status,
          storage_total_bytes,
          storage_used_bytes,
          storage_free_bytes,
          storage_usage_percent,
          verification_status,
          verified_at,
          expires_at,
          source,
          method,
          confidence,
          latency_ms,
          reason,
          checks_json,
          coverage_json,
          details_json,
          raw_payload_hash,
          created_at
        FROM recording_evidence_snapshot
        WHERE 1=1
      `;
      
      const params: any[] = [];
      let paramIndex = 1;
      
      if (query.tenantId) {
        sql += ` AND tenant_id = $${paramIndex}::uuid`;
        params.push(query.tenantId);
        paramIndex++;
      }
      
      if (query.recorderId) {
        sql += ` AND recorder_id = $${paramIndex}::uuid`;
        params.push(query.recorderId);
        paramIndex++;
      }
      
      if (query.channelId) {
        sql += ` AND camera_id = $${paramIndex}::uuid`;
        params.push(query.channelId);
        paramIndex++;
      }
      
      if (query.status) {
        sql += ` AND verification_status = $${paramIndex}`;
        params.push(query.status);
        paramIndex++;
      }
      
      if (query.freshOnly) {
        sql += ` AND expires_at > NOW()`;
      }
      
      if (query.maxAgeSeconds) {
        sql += ` AND verified_at >= NOW() - INTERVAL '${query.maxAgeSeconds} seconds'`;
      }
      
      if (query.minConfidence) {
        sql += ` AND confidence >= $${paramIndex}`;
        params.push(query.minConfidence);
        paramIndex++;
      }
      
      if (query.after) {
        sql += ` AND created_at >= $${paramIndex}`;
        params.push(query.after);
        paramIndex++;
      }
      
      if (query.before) {
        sql += ` AND created_at <= $${paramIndex}`;
        params.push(query.before);
        paramIndex++;
      }
      
      sql += ` ORDER BY created_at DESC`;
      
      if (query.limit) {
        sql += ` LIMIT $${paramIndex}`;
        params.push(query.limit);
      }
      
      const result = await this.pool.query(sql, params);
      
      return result.rows.map(row => this.mapRowToEvidence(row));
    } catch (error) {
      logger.error('Failed to query evidence', {
        error,
        query
      });
      throw error;
    }
  }
  
  /**
   * Save daily coverage summary
   */
  async saveDailyCoverage(summary: DailyCoverageSummary): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO recording_coverage_daily (
          date,
          tenant_id,
          recorder_id,
          camera_id,
          expected_seconds,
          recorded_seconds,
          coverage_ratio,
          largest_gap_seconds,
          verified_at,
          source,
          confidence
        ) VALUES (
          $1, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10, $11
        )
        ON CONFLICT (date, tenant_id, camera_id) 
        DO UPDATE SET
          recorded_seconds = EXCLUDED.recorded_seconds,
          coverage_ratio = EXCLUDED.coverage_ratio,
          largest_gap_seconds = EXCLUDED.largest_gap_seconds,
          verified_at = EXCLUDED.verified_at,
          confidence = EXCLUDED.confidence`,
        [
          summary.date,
          summary.tenantId,
          summary.recorderId,
          summary.cameraId,
          summary.expectedSeconds,
          summary.recordedSeconds,
          summary.coverageRatio,
          summary.largestGapSeconds,
          summary.verifiedAt,
          summary.source,
          summary.confidence
        ]
      );
    } catch (error) {
      logger.error('Failed to save daily coverage summary', {
        error,
        cameraId: summary.cameraId,
        date: summary.date
      });
      throw error;
    }
  }
  
  /**
   * Get daily coverage summaries for a period
   */
  async getDailyCoverage(
    tenantId: string,
    cameraId: string,
    from: Date,
    to: Date
  ): Promise<DailyCoverageSummary[]> {
    try {
      const result = await this.pool.query(
        `SELECT 
          date,
          tenant_id::text,
          recorder_id::text,
          camera_id::text,
          expected_seconds,
          recorded_seconds,
          coverage_ratio,
          largest_gap_seconds,
          verified_at,
          source,
          confidence
        FROM recording_coverage_daily
        WHERE tenant_id = $1::uuid
          AND camera_id = $2::uuid
          AND date >= $3
          AND date <= $4
        ORDER BY date`,
        [tenantId, cameraId, from, to]
      );
      
      return result.rows.map(row => ({
        date: new Date(row.date),
        tenantId: row.tenant_id,
        recorderId: row.recorder_id,
        cameraId: row.camera_id,
        expectedSeconds: parseInt(row.expected_seconds),
        recordedSeconds: parseInt(row.recorded_seconds),
        coverageRatio: parseFloat(row.coverage_ratio),
        largestGapSeconds: parseInt(row.largest_gap_seconds),
        verifiedAt: new Date(row.verified_at),
        source: row.source,
        confidence: parseFloat(row.confidence)
      }));
    } catch (error) {
      logger.error('Failed to get daily coverage', {
        error,
        tenantId,
        cameraId,
        from,
        to
      });
      throw error;
    }
  }
  
  /**
   * Delete old evidence snapshots
   */
  async deleteOlderThan(days: number): Promise<number> {
    try {
      const result = await this.pool.query(
        `DELETE FROM recording_evidence_snapshot
        WHERE created_at < NOW() - INTERVAL '${days} days'`,
        []
      );
      
      return result.rowCount || 0;
    } catch (error) {
      logger.error('Failed to delete old evidence', {
        error,
        days
      });
      throw error;
    }
  }
  
  /**
   * Map database row to RecordingEvidence
   */
  private mapRowToEvidence(row: any): RecordingEvidence {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      recorderId: row.recorder_id,
      channelId: row.camera_id,
      recordingState: row.recording_state,
      latestRecordingAt: row.latest_recording_at ? new Date(row.latest_recording_at) : null,
      oldestRecordingAt: row.oldest_recording_at ? new Date(row.oldest_recording_at) : null,
      retentionDays: row.retention_days ? parseFloat(row.retention_days) : undefined,
      storage: {
        status: row.storage_status,
        totalBytes: row.storage_total_bytes,
        usedBytes: row.storage_used_bytes,
        freeBytes: row.storage_free_bytes,
        usagePercent: row.storage_usage_percent ? parseFloat(row.storage_usage_percent) : undefined
      },
      coverage: row.coverage_json ? JSON.parse(row.coverage_json) : undefined,
      checks: JSON.parse(row.checks_json),
      verification: {
        status: row.verification_status,
        verifiedAt: row.verified_at ? new Date(row.verified_at) : null,
        expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
        source: row.source,
        method: row.method,
        confidence: parseFloat(row.confidence),
        latencyMs: row.latency_ms
      },
      reason: row.reason,
      details: row.details_json ? JSON.parse(row.details_json) : undefined,
      rawPayloadHash: row.raw_payload_hash,
      createdAt: new Date(row.created_at)
    };
  }
}
