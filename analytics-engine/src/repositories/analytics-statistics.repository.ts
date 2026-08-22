/**
 * Analytics Statistics Repository
 * Aggregation queries over analytics_events with tenant isolation and time-bucketing
 */

import type { Pool } from "pg";
import type {
  StatisticsFilters,
  StatisticsSummary,
  TypeStatistics,
  TimelineBucket,
  CameraStatistics,
  BranchStatistics,
  AnalyticsBucket,
} from "../models/analytics-statistics.js";

/**
 * SQL builder for WHERE clause with tenant isolation
 */
function buildWhereClause(filters: StatisticsFilters): { sql: string; params: unknown[] } {
  const clauses = [
    "tenant_id = $1",
    "occurred_at >= $2",
    "occurred_at < $3",
    "status = 'accepted'", // Only count accepted events
  ];

  const params: unknown[] = [
    filters.tenantId,
    filters.from,
    filters.to,
  ];

  if (filters.branchId) {
    // Branch filtering requires join to cameras table
    clauses.push("camera_id IN (SELECT id FROM cameras WHERE branch_id = $" + (params.length + 1) + ")");
    params.push(filters.branchId);
  }

  if (filters.cameraId) {
    params.push(filters.cameraId);
    clauses.push(`camera_id = $${params.length}`);
  }

  if (filters.detectorTypes?.length) {
    params.push(filters.detectorTypes);
    clauses.push(`detection_type = ANY($${params.length}::text[])`);
  }

  if (filters.severities?.length) {
    // Severity is stored in analytics_alerts, so this would require a join
    // For now, we'll note this is a future enhancement
    // params.push(filters.severities);
    // clauses.push(`severity = ANY($${params.length}::text[])`);
  }

  return {
    sql: clauses.join(" AND "),
    params,
  };
}

/**
 * Get SQL for time bucket truncation
 */
function getBucketSql(bucket: AnalyticsBucket): string {
  const bucketMap: Record<AnalyticsBucket, string> = {
    minute: "minute",
    hour: "hour",
    day: "day",
    week: "week",
  };

  return bucketMap[bucket];
}

/**
 * Get interval for generating time series
 */
function getBucketInterval(bucket: AnalyticsBucket): string {
  const intervalMap: Record<AnalyticsBucket, string> = {
    minute: "1 minute",
    hour: "1 hour",
    day: "1 day",
    week: "1 week",
  };

  return intervalMap[bucket];
}

export class AnalyticsStatisticsRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Get summary statistics
   */
  async getSummary(filters: StatisticsFilters): Promise<StatisticsSummary> {
    const { sql, params } = buildWhereClause(filters);

    const query = `
      SELECT
        COUNT(*)::bigint AS total_detections,
        AVG(confidence) FILTER (WHERE confidence IS NOT NULL) AS average_confidence,
        COUNT(DISTINCT primary_rule_id) FILTER (WHERE primary_rule_id IS NOT NULL)::bigint AS alerts
      FROM analytics_events
      WHERE ${sql}
    `;

    const result = await this.pool.query(query, params);
    const row = result.rows[0];

    return {
      totalDetections: Number(row.total_detections),
      averageConfidence: row.average_confidence === null ? null : Number(row.average_confidence),
      alerts: Number(row.alerts),
    };
  }

  /**
   * Get statistics by detection type
   */
  async getByType(filters: StatisticsFilters): Promise<Record<string, TypeStatistics>> {
    const { sql, params } = buildWhereClause(filters);

    const query = `
      SELECT
        detection_type,
        COUNT(*)::bigint AS detection_count,
        AVG(confidence) FILTER (WHERE confidence IS NOT NULL) AS average_confidence,
        COUNT(DISTINCT primary_rule_id) FILTER (WHERE primary_rule_id IS NOT NULL)::bigint AS alert_count
      FROM analytics_events
      WHERE ${sql}
      GROUP BY detection_type
      ORDER BY detection_count DESC
    `;

    const result = await this.pool.query(query, params);
    const byType: Record<string, TypeStatistics> = {};

    for (const row of result.rows) {
      byType[row.detection_type] = {
        count: Number(row.detection_count),
        averageConfidence: row.average_confidence === null ? null : Number(row.average_confidence),
        alerts: Number(row.alert_count),
      };
    }

    return byType;
  }

  /**
   * Get statistics by severity (from alerts)
   */
  async getBySeverity(filters: StatisticsFilters): Promise<Record<string, number>> {
    const { sql, params } = buildWhereClause(filters);

    // Join with analytics_alerts to get severity information
    const query = `
      SELECT
        a.severity,
        COUNT(DISTINCT e.id)::bigint AS event_count
      FROM analytics_events e
      JOIN analytics_alerts a ON a.event_id = e.id
      WHERE ${sql}
      GROUP BY a.severity
      ORDER BY event_count DESC
    `;

    const result = await this.pool.query(query, params);
    const bySeverity: Record<string, number> = {};

    for (const row of result.rows) {
      bySeverity[row.severity] = Number(row.event_count);
    }

    return bySeverity;
  }

  /**
   * Get timeline with time buckets
   */
  async getTimeline(
    filters: StatisticsFilters,
    bucket: AnalyticsBucket
  ): Promise<TimelineBucket[]> {
    const { sql, params } = buildWhereClause(filters);
    const bucketSql = getBucketSql(bucket);
    const bucketInterval = getBucketInterval(bucket);

    // Generate complete time series with zero-filled buckets
    const query = `
      WITH buckets AS (
        SELECT generate_series(
          date_trunc('${bucketSql}', $2::timestamptz),
          date_trunc('${bucketSql}', $3::timestamptz),
          interval '${bucketInterval}'
        ) AS bucket
      ),
      counts AS (
        SELECT
          date_trunc('${bucketSql}', occurred_at) AS bucket,
          COUNT(*)::bigint AS detection_count,
          AVG(confidence) FILTER (WHERE confidence IS NOT NULL) AS average_confidence,
          COUNT(DISTINCT primary_rule_id) FILTER (WHERE primary_rule_id IS NOT NULL)::bigint AS alert_count,
          jsonb_object_agg(
            detection_type,
            count
          ) FILTER (WHERE detection_type IS NOT NULL) AS by_type
        FROM (
          SELECT
            occurred_at,
            confidence,
            primary_rule_id,
            detection_type,
            COUNT(*) AS count
          FROM analytics_events
          WHERE ${sql}
          GROUP BY date_trunc('${bucketSql}', occurred_at), detection_type, occurred_at, confidence, primary_rule_id
        ) sub
        GROUP BY date_trunc('${bucketSql}', occurred_at)
      )
      SELECT
        buckets.bucket,
        COALESCE(counts.detection_count, 0) AS detection_count,
        counts.average_confidence,
        COALESCE(counts.alert_count, 0) AS alert_count,
        COALESCE(counts.by_type, '{}'::jsonb) AS by_type
      FROM buckets
      LEFT JOIN counts ON counts.bucket = buckets.bucket
      ORDER BY buckets.bucket
    `;

    const result = await this.pool.query(query, params);

    return result.rows.map((row) => ({
      timestamp: new Date(row.bucket).toISOString(),
      total: Number(row.detection_count),
      alerts: Number(row.alert_count),
      averageConfidence: row.average_confidence === null ? null : Number(row.average_confidence),
      byType: row.by_type || {},
    }));
  }

  /**
   * Get top cameras by detection count
   */
  async getTopCameras(filters: StatisticsFilters, limit: number = 10): Promise<CameraStatistics[]> {
    const { sql, params } = buildWhereClause(filters);

    const query = `
      SELECT
        camera_id,
        COUNT(*)::bigint AS detection_count,
        COUNT(DISTINCT primary_rule_id) FILTER (WHERE primary_rule_id IS NOT NULL)::bigint AS alert_count
      FROM analytics_events
      WHERE ${sql}
      GROUP BY camera_id
      ORDER BY detection_count DESC
      LIMIT $${params.length + 1}
    `;

    const result = await this.pool.query(query, [...params, limit]);

    return result.rows.map((row) => ({
      cameraId: row.camera_id,
      detections: Number(row.detection_count),
      alerts: Number(row.alert_count),
    }));
  }

  /**
   * Get top branches by detection count (requires camera join)
   */
  async getTopBranches(filters: StatisticsFilters, limit: number = 10): Promise<BranchStatistics[]> {
    const { sql, params } = buildWhereClause(filters);

    const query = `
      SELECT
        c.branch_id,
        COUNT(e.id)::bigint AS detection_count,
        COUNT(DISTINCT e.primary_rule_id) FILTER (WHERE e.primary_rule_id IS NOT NULL)::bigint AS alert_count
      FROM analytics_events e
      JOIN cameras c ON c.id = e.camera_id
      WHERE ${sql} AND c.branch_id IS NOT NULL
      GROUP BY c.branch_id
      ORDER BY detection_count DESC
      LIMIT $${params.length + 1}
    `;

    const result = await this.pool.query(query, [...params, limit]);

    return result.rows.map((row) => ({
      branchId: row.branch_id,
      detections: Number(row.detection_count),
      alerts: Number(row.alert_count),
    }));
  }

  /**
   * Health check - verify table exists and is accessible
   */
  async healthCheck(tenantId: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        "SELECT COUNT(*) FROM analytics_events WHERE tenant_id = $1 LIMIT 1",
        [tenantId]
      );
      return true;
    } catch (error) {
      return false;
    }
  }
}
