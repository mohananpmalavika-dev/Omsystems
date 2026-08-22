/**
 * Digital Twin History Repository
 * 
 * Manages historical state snapshots and events for digital twin assets.
 */

import { Pool } from 'pg';
import { TwinStateSnapshot, TwinEvent } from '../models.js';

export class HistoryRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Create state snapshot
   */
  async createSnapshot(snapshot: TwinStateSnapshot): Promise<TwinStateSnapshot> {
    const result = await this.pool.query(
      `
      INSERT INTO twin_state_history (
        id, asset_id, timestamp, status, health_score, security_score, metrics, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        snapshot.id,
        snapshot.assetId,
        snapshot.timestamp,
        snapshot.status,
        snapshot.healthScore,
        snapshot.securityScore,
        JSON.stringify(snapshot.metrics),
        JSON.stringify(snapshot.metadata || {})
      ]
    );

    return this.mapSnapshotRow(result.rows[0]);
  }

  /**
   * Get latest snapshot for an asset
   */
  async getLatestSnapshot(assetId: string): Promise<TwinStateSnapshot | null> {
    const result = await this.pool.query(
      `
      SELECT * FROM twin_state_history
      WHERE asset_id = $1
      ORDER BY timestamp DESC
      LIMIT 1
      `,
      [assetId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapSnapshotRow(result.rows[0]);
  }

  /**
   * Get snapshot history for an asset
   */
  async getSnapshotHistory(
    assetId: string,
    from: Date,
    to: Date,
    limit: number = 1000
  ): Promise<TwinStateSnapshot[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM twin_state_history
      WHERE asset_id = $1
        AND timestamp BETWEEN $2 AND $3
      ORDER BY timestamp DESC
      LIMIT $4
      `,
      [assetId, from, to, limit]
    );

    return result.rows.map(row => this.mapSnapshotRow(row));
  }

  /**
   * Get snapshot at specific time
   */
  async getSnapshotAt(assetId: string, timestamp: Date): Promise<TwinStateSnapshot | null> {
    const result = await this.pool.query(
      `
      SELECT * FROM twin_state_history
      WHERE asset_id = $1
        AND timestamp <= $2
      ORDER BY timestamp DESC
      LIMIT 1
      `,
      [assetId, timestamp]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapSnapshotRow(result.rows[0]);
  }

  /**
   * Delete old snapshots (retention policy)
   */
  async deleteOldSnapshots(olderThan: Date): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM twin_state_history WHERE timestamp < $1`,
      [olderThan]
    );

    return result.rowCount || 0;
  }

  /**
   * Create event
   */
  async createEvent(event: TwinEvent): Promise<TwinEvent> {
    const result = await this.pool.query(
      `
      INSERT INTO twin_events (
        id, event_type, asset_id, asset_name, timestamp,
        previous_state, new_state, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        event.id,
        event.eventType,
        event.assetId,
        event.assetName || null,
        event.timestamp,
        JSON.stringify(event.previousState || {}),
        JSON.stringify(event.newState || {}),
        JSON.stringify(event.metadata || {})
      ]
    );

    return this.mapEventRow(result.rows[0]);
  }

  /**
   * Get events for an asset
   */
  async getAssetEvents(
    assetId: string,
    limit: number = 100
  ): Promise<TwinEvent[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM twin_events
      WHERE asset_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
      `,
      [assetId, limit]
    );

    return result.rows.map(row => this.mapEventRow(row));
  }

  /**
   * Get events by type
   */
  async getEventsByType(
    eventType: TwinEvent['eventType'],
    from: Date,
    to: Date,
    limit: number = 100
  ): Promise<TwinEvent[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM twin_events
      WHERE event_type = $1
        AND timestamp BETWEEN $2 AND $3
      ORDER BY timestamp DESC
      LIMIT $4
      `,
      [eventType, from, to, limit]
    );

    return result.rows.map(row => this.mapEventRow(row));
  }

  /**
   * Get recent events across all assets
   */
  async getRecentEvents(limit: number = 100): Promise<TwinEvent[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM twin_events
      ORDER BY timestamp DESC
      LIMIT $1
      `,
      [limit]
    );

    return result.rows.map(row => this.mapEventRow(row));
  }

  /**
   * Get timeline of changes for an asset
   */
  async getAssetTimeline(
    assetId: string,
    from: Date,
    to: Date
  ): Promise<Array<{
    timestamp: Date;
    type: 'snapshot' | 'event';
    data: TwinStateSnapshot | TwinEvent;
  }>> {
    const snapshots = await this.getSnapshotHistory(assetId, from, to);
    const events = await this.pool.query(
      `
      SELECT * FROM twin_events
      WHERE asset_id = $1
        AND timestamp BETWEEN $2 AND $3
      ORDER BY timestamp DESC
      `,
      [assetId, from, to]
    );

    const timeline: Array<{
      timestamp: Date;
      type: 'snapshot' | 'event';
      data: TwinStateSnapshot | TwinEvent;
    }> = [
      ...snapshots.map(s => ({
        timestamp: s.timestamp,
        type: 'snapshot' as const,
        data: s
      })),
      ...events.rows.map(e => ({
        timestamp: new Date(e.timestamp),
        type: 'event' as const,
        data: this.mapEventRow(e)
      }))
    ];

    // Sort by timestamp
    timeline.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return timeline;
  }

  /**
   * Get state changes between two timestamps
   */
  async getStateChanges(
    assetId: string,
    from: Date,
    to: Date
  ): Promise<Array<{
    field: string;
    oldValue: any;
    newValue: any;
    changedAt: Date;
  }>> {
    const snapshots = await this.getSnapshotHistory(assetId, from, to);
    if (snapshots.length < 2) {
      return [];
    }

    const changes: Array<{
      field: string;
      oldValue: any;
      newValue: any;
      changedAt: Date;
    }> = [];

    for (let i = 0; i < snapshots.length - 1; i++) {
      const current = snapshots[i];
      const previous = snapshots[i + 1];

      if (current.status !== previous.status) {
        changes.push({
          field: 'status',
          oldValue: previous.status,
          newValue: current.status,
          changedAt: current.timestamp
        });
      }

      if (current.healthScore !== previous.healthScore) {
        changes.push({
          field: 'healthScore',
          oldValue: previous.healthScore,
          newValue: current.healthScore,
          changedAt: current.timestamp
        });
      }

      if (current.securityScore !== previous.securityScore) {
        changes.push({
          field: 'securityScore',
          oldValue: previous.securityScore,
          newValue: current.securityScore,
          changedAt: current.timestamp
        });
      }
    }

    return changes;
  }

  /**
   * Delete old events (retention policy)
   */
  async deleteOldEvents(olderThan: Date): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM twin_events WHERE timestamp < $1`,
      [olderThan]
    );

    return result.rowCount || 0;
  }

  /**
   * Map snapshot row
   */
  private mapSnapshotRow(row: any): TwinStateSnapshot {
    return {
      id: row.id,
      assetId: row.asset_id,
      timestamp: new Date(row.timestamp),
      status: row.status,
      healthScore: row.health_score,
      securityScore: row.security_score,
      metrics: row.metrics || {},
      metadata: row.metadata || {}
    };
  }

  /**
   * Map event row
   */
  private mapEventRow(row: any): TwinEvent {
    return {
      id: row.id,
      eventType: row.event_type,
      assetId: row.asset_id,
      assetName: row.asset_name,
      timestamp: new Date(row.timestamp),
      previousState: row.previous_state || {},
      newState: row.new_state || {},
      metadata: row.metadata || {}
    };
  }
}
