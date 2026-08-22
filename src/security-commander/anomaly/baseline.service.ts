/**
 * Baseline Service
 * 
 * Manages statistical baselines for event frequency patterns.
 */

import type { Pool } from 'pg';
import type { SecurityEvent } from '../types/index.js';

export interface EventBaseline {
  entityId: string;
  entityType: string;
  eventType: string;
  hourOfWeek: number;
  mean: number;
  stddev: number;
  p50: number;
  p95: number;
  p99: number;
  minValue: number;
  maxValue: number;
  sampleCount: number;
}

export interface AnomalyCheck {
  isAnomaly: boolean;
  zScore: number;
  expected: number;
  actual: number;
  threshold: number;
}

export class BaselineService {
  constructor(private readonly pool: Pool) {}

  /**
   * Calculate baseline statistics for an entity's event type
   */
  async calculateBaseline(
    tenantId: string,
    entityId: string,
    entityType: string,
    eventType: string,
    from: Date,
    to: Date
  ): Promise<void> {
    // Get all events for this entity/type in the time range
    const events = await this.pool.query<{
      occurred_at: Date;
      hour_of_week: number;
      event_count: number;
    }>(
      `SELECT 
         date_trunc('hour', occurred_at) as occurred_at,
         EXTRACT(DOW FROM occurred_at)::int * 24 + EXTRACT(HOUR FROM occurred_at)::int as hour_of_week,
         COUNT(*)::int as event_count
       FROM security_events
       WHERE tenant_id = $1
         AND source_id = $2
         AND source_type = $3
         AND event_type = $4
         AND occurred_at >= $5
         AND occurred_at <= $6
       GROUP BY date_trunc('hour', occurred_at), hour_of_week
       ORDER BY occurred_at`,
      [tenantId, entityId, entityType, eventType, from, to]
    );

    if (events.rows.length === 0) return;

    // Group by hour of week
    const byHourOfWeek = new Map<number, number[]>();

    for (const row of events.rows) {
      const hour = row.hour_of_week;
      if (!byHourOfWeek.has(hour)) {
        byHourOfWeek.set(hour, []);
      }
      byHourOfWeek.get(hour)!.push(row.event_count);
    }

    // Calculate statistics for each hour
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const [hourOfWeek, counts] of byHourOfWeek.entries()) {
        const stats = this.calculateStatistics(counts);

        // Upsert baseline
        await client.query(
          `INSERT INTO security_event_baselines (
             id, tenant_id, entity_id, entity_type, event_type, hour_of_week,
             mean, stddev, p50, p95, p99, min_value, max_value, sample_count,
             calculated_from, calculated_to, calculated_at
           ) VALUES (
             gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()
           )
           ON CONFLICT (tenant_id, entity_id, event_type, hour_of_week)
           DO UPDATE SET
             mean = EXCLUDED.mean,
             stddev = EXCLUDED.stddev,
             p50 = EXCLUDED.p50,
             p95 = EXCLUDED.p95,
             p99 = EXCLUDED.p99,
             min_value = EXCLUDED.min_value,
             max_value = EXCLUDED.max_value,
             sample_count = EXCLUDED.sample_count,
             calculated_from = EXCLUDED.calculated_from,
             calculated_to = EXCLUDED.calculated_to,
             calculated_at = NOW()`,
          [
            tenantId,
            entityId,
            entityType,
            eventType,
            hourOfWeek,
            stats.mean,
            stats.stddev,
            stats.p50,
            stats.p95,
            stats.p99,
            stats.min,
            stats.max,
            stats.count,
            from,
            to,
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get baseline for an entity at a specific time
   */
  async getBaseline(
    tenantId: string,
    entityId: string,
    eventType: string,
    timestamp: Date
  ): Promise<EventBaseline | undefined> {
    const hourOfWeek = this.getHourOfWeek(timestamp);

    const result = await this.pool.query<EventBaseline>(
      `SELECT 
         entity_id, entity_type, event_type, hour_of_week,
         mean, stddev, p50, p95, p99, 
         min_value as "minValue",
         max_value as "maxValue",
         sample_count as "sampleCount"
       FROM security_event_baselines
       WHERE tenant_id = $1
         AND entity_id = $2
         AND event_type = $3
         AND hour_of_week = $4`,
      [tenantId, entityId, eventType, hourOfWeek]
    );

    return result.rows[0];
  }

  /**
   * Check if current event count is anomalous
   */
  async checkAnomaly(
    tenantId: string,
    entityId: string,
    eventType: string,
    currentCount: number,
    timestamp: Date,
    zScoreThreshold: number = 3.0
  ): Promise<AnomalyCheck> {
    const baseline = await this.getBaseline(tenantId, entityId, eventType, timestamp);

    if (!baseline || baseline.sampleCount < 10) {
      // Not enough data for baseline
      return {
        isAnomaly: false,
        zScore: 0,
        expected: 0,
        actual: currentCount,
        threshold: zScoreThreshold,
      };
    }

    // Calculate z-score
    const zScore = baseline.stddev > 0
      ? (currentCount - baseline.mean) / baseline.stddev
      : 0;

    return {
      isAnomaly: Math.abs(zScore) >= zScoreThreshold,
      zScore,
      expected: baseline.mean,
      actual: currentCount,
      threshold: zScoreThreshold,
    };
  }

  /**
   * Batch calculate baselines for multiple entities
   */
  async calculateBaselinesForBranch(
    tenantId: string,
    branchId: string,
    from: Date,
    to: Date
  ): Promise<void> {
    // Get all unique source combinations
    const sources = await this.pool.query<{
      source_id: string;
      source_type: string;
      event_type: string;
    }>(
      `SELECT DISTINCT source_id, source_type, event_type
       FROM security_events
       WHERE tenant_id = $1
         AND branch_id = $2
         AND occurred_at >= $3
         AND occurred_at <= $4`,
      [tenantId, branchId, from, to]
    );

    // Calculate baseline for each
    for (const source of sources.rows) {
      await this.calculateBaseline(
        tenantId,
        source.source_id,
        source.source_type,
        source.event_type,
        from,
        to
      );
    }
  }

  /**
   * Calculate statistics from array of numbers
   */
  private calculateStatistics(values: number[]): {
    mean: number;
    stddev: number;
    p50: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    count: number;
  } {
    if (values.length === 0) {
      return {
        mean: 0,
        stddev: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        min: 0,
        max: 0,
        count: 0,
      };
    }

    // Sort for percentiles
    const sorted = [...values].sort((a, b) => a - b);

    // Mean
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;

    // Standard deviation
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stddev = Math.sqrt(variance);

    // Percentiles
    const getPercentile = (p: number) => {
      const index = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[Math.max(0, index)];
    };

    return {
      mean,
      stddev,
      p50: getPercentile(50),
      p95: getPercentile(95),
      p99: getPercentile(99),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      count: values.length,
    };
  }

  /**
   * Get hour of week (0-167)
   */
  private getHourOfWeek(date: Date): number {
    const dayOfWeek = date.getDay(); // 0 = Sunday
    const hour = date.getHours();
    return dayOfWeek * 24 + hour;
  }

  /**
   * Delete old baselines
   */
  async deleteOldBaselines(tenantId: string, beforeDate: Date): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM security_event_baselines
       WHERE tenant_id = $1
         AND calculated_at < $2`,
      [tenantId, beforeDate]
    );

    return result.rowCount || 0;
  }
}
