/**
 * Evidence Repository
 * 
 * Persists and retrieves recorder evidence snapshots.
 * 
 * Database schema:
 * - recorder_evidence_snapshots: Main evidence snapshots
 * - recorder_channel_evidence: Per-channel evidence
 * 
 * This provides durable evidence for compliance, reporting, and trend analysis.
 */

import type {
  RecorderEvidence,
  ChannelEvidence,
  StorageEvidence,
  DeviceClockEvidence
} from '../contracts/recorder-evidence.js';
import type { EvidenceState } from '../contracts/evidence-value.js';
import { Pool } from 'pg';
import { logger } from '../../utils/logger.js';

/**
 * Evidence snapshot row
 */
export interface EvidenceSnapshotRow {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  recorder_id: string;
  adapter_type: string;
  collected_at: Date;
  
  // Reachability
  reachable_state: EvidenceState;
  reachable_value: boolean | null;
  
  // Authentication
  authenticated_state: EvidenceState;
  authenticated_value: boolean | null;
  
  // Device info
  device_manufacturer: string | null;
  device_model: string | null;
  device_firmware: string | null;
  device_serial: string | null;
  
  // Storage
  storage_state: EvidenceState;
  storage_total_bytes: number | null;
  storage_used_bytes: number | null;
  storage_usage_percent: number | null;
  
  // Device time
  device_time_state: EvidenceState;
  device_time_offset_ms: number | null;
  
  // Metadata
  collection_duration_ms: number;
  raw_metadata: any;
  
  created_at: Date;
}

/**
 * Channel evidence row
 */
export interface ChannelEvidenceRow {
  id: string;
  snapshot_id: string;
  channel_id: string;
  vendor_channel_ref: string | null;
  channel_name: string | null;
  
  // Evidence states
  enabled_state: EvidenceState;
  enabled_value: boolean | null;
  
  stream_state: EvidenceState;
  stream_reachable: boolean | null;
  
  video_state: EvidenceState;
  video_present: boolean | null;
  
  recording_configured_state: EvidenceState;
  recording_configured: boolean | null;
  
  recording_active_state: EvidenceState;
  recording_active: boolean | null;
  
  latest_recording_state: EvidenceState;
  latest_recording_at: Date | null;
  
  archive_state: EvidenceState;
  archive_playable: boolean | null;
  
  created_at: Date;
}

/**
 * Evidence Repository
 */
export class EvidenceRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Save evidence snapshot
   */
  async saveEvidence(evidence: RecorderEvidence): Promise<string> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Insert main snapshot
      const snapshotResult = await client.query<{ id: string }>(`
        INSERT INTO recorder_evidence_snapshots (
          tenant_id,
          branch_id,
          recorder_id,
          adapter_type,
          collected_at,
          reachable_state,
          reachable_value,
          authenticated_state,
          authenticated_value,
          device_manufacturer,
          device_model,
          device_firmware,
          device_serial,
          storage_state,
          storage_total_bytes,
          storage_used_bytes,
          storage_usage_percent,
          device_time_state,
          device_time_offset_ms,
          collection_duration_ms,
          raw_metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
        )
        RETURNING id
      `, [
        evidence.tenantId,
        evidence.branchId,
        evidence.recorderId,
        evidence.primaryAdapter,
        evidence.collectedAt,
        evidence.reachable.state,
        evidence.reachable.value ?? null,
        evidence.authenticated.state,
        evidence.authenticated.value ?? null,
        evidence.deviceInfo.value?.manufacturer ?? null,
        evidence.deviceInfo.value?.model ?? null,
        evidence.deviceInfo.value?.firmwareVersion ?? null,
        evidence.deviceInfo.value?.serialNumber ?? null,
        evidence.storage.state,
        evidence.storage.value?.totalBytes ?? null,
        evidence.storage.value?.usedBytes ?? null,
        evidence.storage.value?.usagePercent ?? null,
        evidence.deviceTime.state,
        evidence.deviceTime.value?.offsetMs ?? null,
        evidence.collectionDurationMs,
        JSON.stringify({
          capabilities: evidence.capabilities,
          storage: evidence.storage.value,
          deviceTime: evidence.deviceTime.value
        })
      ]);

      const snapshotId = snapshotResult.rows[0].id;

      // Insert channel evidence
      if (evidence.channels.state === 'OBSERVED' && evidence.channels.value) {
        for (const channel of evidence.channels.value) {
          await this.saveChannelEvidence(client, snapshotId, channel);
        }
      }

      await client.query('COMMIT');

      logger.info('Evidence snapshot saved', {
        snapshotId,
        recorderId: evidence.recorderId,
        channelCount: evidence.channels.value?.length ?? 0
      });

      return snapshotId;

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to save evidence snapshot', { error, evidence });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Save channel evidence
   */
  private async saveChannelEvidence(
    client: any,
    snapshotId: string,
    channel: ChannelEvidence
  ): Promise<void> {
    await client.query(`
      INSERT INTO recorder_channel_evidence (
        snapshot_id,
        channel_id,
        vendor_channel_ref,
        channel_name,
        enabled_state,
        enabled_value,
        stream_state,
        stream_reachable,
        video_state,
        video_present,
        recording_configured_state,
        recording_configured,
        recording_active_state,
        recording_active,
        latest_recording_state,
        latest_recording_at,
        archive_state,
        archive_playable
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18
      )
    `, [
      snapshotId,
      channel.channelId,
      channel.vendorChannelRef,
      channel.name,
      channel.enabled.state,
      channel.enabled.value ?? null,
      channel.streamReachable.state,
      channel.streamReachable.value ?? null,
      channel.videoPresent.state,
      channel.videoPresent.value ?? null,
      channel.recordingConfigured.state,
      channel.recordingConfigured.value ?? null,
      channel.recordingActive.state,
      channel.recordingActive.value ?? null,
      channel.latestRecordingAt.state,
      channel.latestRecordingAt.value ?? null,
      channel.archivePlayable.state,
      channel.archivePlayable.value ?? null
    ]);
  }

  /**
   * Get latest evidence for recorder
   */
  async getLatestEvidence(recorderId: string): Promise<EvidenceSnapshotRow | null> {
    const result = await this.pool.query<EvidenceSnapshotRow>(`
      SELECT *
      FROM recorder_evidence_snapshots
      WHERE recorder_id = $1
      ORDER BY collected_at DESC
      LIMIT 1
    `, [recorderId]);

    return result.rows[0] || null;
  }

  /**
   * Get latest channel evidence
   */
  async getLatestChannelEvidence(
    recorderId: string,
    channelId: string
  ): Promise<ChannelEvidenceRow | null> {
    const result = await this.pool.query<ChannelEvidenceRow>(`
      SELECT ce.*
      FROM recorder_channel_evidence ce
      JOIN recorder_evidence_snapshots es ON ce.snapshot_id = es.id
      WHERE es.recorder_id = $1 AND ce.channel_id = $2
      ORDER BY es.collected_at DESC
      LIMIT 1
    `, [recorderId, channelId]);

    return result.rows[0] || null;
  }

  /**
   * Get evidence history
   */
  async getEvidenceHistory(
    recorderId: string,
    startTime: Date,
    endTime: Date,
    limit: number = 100
  ): Promise<EvidenceSnapshotRow[]> {
    const result = await this.pool.query<EvidenceSnapshotRow>(`
      SELECT *
      FROM recorder_evidence_snapshots
      WHERE recorder_id = $1
        AND collected_at BETWEEN $2 AND $3
      ORDER BY collected_at DESC
      LIMIT $4
    `, [recorderId, startTime, endTime, limit]);

    return result.rows;
  }

  /**
   * Get channel evidence history
   */
  async getChannelEvidenceHistory(
    recorderId: string,
    channelId: string,
    startTime: Date,
    endTime: Date,
    limit: number = 100
  ): Promise<ChannelEvidenceRow[]> {
    const result = await this.pool.query<ChannelEvidenceRow>(`
      SELECT ce.*
      FROM recorder_channel_evidence ce
      JOIN recorder_evidence_snapshots es ON ce.snapshot_id = es.id
      WHERE es.recorder_id = $1
        AND ce.channel_id = $2
        AND es.collected_at BETWEEN $3 AND $4
      ORDER BY es.collected_at DESC
      LIMIT $5
    `, [recorderId, channelId, startTime, endTime, limit]);

    return result.rows;
  }

  /**
   * Get recorders with stale evidence
   */
  async getRecordersWithStaleEvidence(
    staleThresholdMs: number = 10 * 60 * 1000
  ): Promise<Array<{ recorderId: string; lastCollectedAt: Date }>> {
    const staleTime = new Date(Date.now() - staleThresholdMs);

    const result = await this.pool.query<{ recorder_id: string; collected_at: Date }>(`
      SELECT DISTINCT ON (recorder_id)
        recorder_id,
        collected_at
      FROM recorder_evidence_snapshots
      WHERE collected_at < $1
      ORDER BY recorder_id, collected_at DESC
    `, [staleTime]);

    return result.rows.map(row => ({
      recorderId: row.recorder_id,
      lastCollectedAt: row.collected_at
    }));
  }

  /**
   * Delete old evidence snapshots
   */
  async deleteOldEvidence(
    retentionDays: number = 90
  ): Promise<number> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await this.pool.query(`
      DELETE FROM recorder_evidence_snapshots
      WHERE collected_at < $1
    `, [cutoffDate]);

    logger.info('Deleted old evidence snapshots', {
      deletedCount: result.rowCount,
      cutoffDate
    });

    return result.rowCount || 0;
  }

  /**
   * Get evidence statistics
   */
  async getEvidenceStats(): Promise<{
    totalSnapshots: number;
    totalRecorders: number;
    oldestSnapshot: Date | null;
    newestSnapshot: Date | null;
  }> {
    const result = await this.pool.query(`
      SELECT
        COUNT(*) as total_snapshots,
        COUNT(DISTINCT recorder_id) as total_recorders,
        MIN(collected_at) as oldest_snapshot,
        MAX(collected_at) as newest_snapshot
      FROM recorder_evidence_snapshots
    `);

    const row = result.rows[0];

    return {
      totalSnapshots: parseInt(row.total_snapshots, 10),
      totalRecorders: parseInt(row.total_recorders, 10),
      oldestSnapshot: row.oldest_snapshot,
      newestSnapshot: row.newest_snapshot
    };
  }
}
