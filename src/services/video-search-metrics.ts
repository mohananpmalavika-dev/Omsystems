/**
 * Video Search Metrics and Observability
 * 
 * Comprehensive monitoring for AI video search including:
 * - Performance metrics (latency, throughput)
 * - Error tracking and alerting
 * - Query analytics
 * - Resource utilization
 * - SLA monitoring
 */

import type { Pool } from "pg";
import { EventEmitter } from "node:events";

/**
 * Metric types
 */
export type MetricType = "counter" | "gauge" | "histogram" | "summary";

/**
 * Metric event
 */
export interface MetricEvent {
  name: string;
  type: MetricType;
  value: number;
  labels?: Record<string, string>;
  timestamp: Date;
}

/**
 * Search performance metrics
 */
export interface SearchPerformanceMetrics {
  totalSearches: number;
  successfulSearches: number;
  failedSearches: number;
  avgResponseTimeMs: number;
  p50ResponseTimeMs: number;
  p95ResponseTimeMs: number;
  p99ResponseTimeMs: number;
  throughputPerMinute: number;
}

/**
 * Indexing performance metrics
 */
export interface IndexingPerformanceMetrics {
  totalIndexingJobs: number;
  successfulJobs: number;
  failedJobs: number;
  avgProcessingTimeMs: number;
  objectsIndexedPerMinute: number;
  embeddingsGeneratedPerMinute: number;
}

/**
 * Error metrics
 */
export interface ErrorMetrics {
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsByEndpoint: Record<string, number>;
  errorRate: number;
}

/**
 * Query analytics
 */
export interface QueryAnalytics {
  topQueries: Array<{ query: string; count: number; avgResponseTime: number }>;
  topAttributes: Array<{ attribute: string; count: number }>;
  queryComplexityDistribution: Record<number, number>;
  searchTypeDistribution: Record<string, number>;
}

/**
 * Metrics collector
 */
export class VideoSearchMetrics extends EventEmitter {
  private pool: Pool;
  private metrics: Map<string, MetricEvent[]> = new Map();
  private timers: Map<string, number> = new Map();
  
  // In-memory counters for fast access
  private counters = {
    searches: { total: 0, success: 0, failed: 0 },
    indexing: { total: 0, success: 0, failed: 0 },
    errors: { total: 0, byType: new Map<string, number>() },
    queries: new Map<string, { count: number, totalTime: number }>(),
  };

  // Performance tracking
  private responseTimes: number[] = [];
  private readonly maxResponseTimeSamples = 1000;

  constructor(pool: Pool) {
    super();
    this.pool = pool;
    
    // Periodically flush metrics to database
    this.startMetricsFlushing();
    
    // Periodically calculate aggregates
    this.startAggregation();
  }

  /**
   * Record a metric
   */
  recordMetric(event: MetricEvent): void {
    const key = `${event.name}:${event.type}`;
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    this.metrics.get(key)!.push(event);
    
    // Emit for real-time monitoring
    this.emit("metric", event);
    
    // Keep only recent metrics in memory
    const events = this.metrics.get(key)!;
    if (events.length > 10000) {
      events.splice(0, events.length - 10000);
    }
  }

  /**
   * Start a timer for measuring operation duration
   */
  startTimer(operationId: string): void {
    this.timers.set(operationId, Date.now());
  }

  /**
   * End a timer and record the duration
   */
  endTimer(
    operationId: string,
    metricName: string,
    labels?: Record<string, string>
  ): number {
    const startTime = this.timers.get(operationId);
    if (!startTime) {
      console.warn(`Timer not found: ${operationId}`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.timers.delete(operationId);

    this.recordMetric({
      name: metricName,
      type: "histogram",
      value: duration,
      labels,
      timestamp: new Date(),
    });

    return duration;
  }

  /**
   * Record a search operation
   */
  recordSearch(params: {
    success: boolean;
    responseTimeMs: number;
    queryType: "natural_language" | "attribute" | "similarity" | "tracking";
    tenantId: string;
    resultCount: number;
    query?: string;
    complexity?: number;
  }): void {
    // Update counters
    this.counters.searches.total++;
    if (params.success) {
      this.counters.searches.success++;
    } else {
      this.counters.searches.failed++;
    }

    // Track response time
    this.responseTimes.push(params.responseTimeMs);
    if (this.responseTimes.length > this.maxResponseTimeSamples) {
      this.responseTimes.shift();
    }

    // Track query analytics
    if (params.query) {
      const queryKey = params.query.toLowerCase().slice(0, 100);
      const existing = this.counters.queries.get(queryKey);
      if (existing) {
        existing.count++;
        existing.totalTime += params.responseTimeMs;
      } else {
        this.counters.queries.set(queryKey, {
          count: 1,
          totalTime: params.responseTimeMs,
        });
      }
    }

    // Record metrics
    this.recordMetric({
      name: "video_search_requests_total",
      type: "counter",
      value: 1,
      labels: {
        status: params.success ? "success" : "failure",
        query_type: params.queryType,
        tenant_id: params.tenantId,
      },
      timestamp: new Date(),
    });

    this.recordMetric({
      name: "video_search_response_time_ms",
      type: "histogram",
      value: params.responseTimeMs,
      labels: {
        query_type: params.queryType,
        tenant_id: params.tenantId,
      },
      timestamp: new Date(),
    });

    this.recordMetric({
      name: "video_search_result_count",
      type: "histogram",
      value: params.resultCount,
      labels: {
        query_type: params.queryType,
        tenant_id: params.tenantId,
      },
      timestamp: new Date(),
    });

    if (params.complexity !== undefined) {
      this.recordMetric({
        name: "video_search_query_complexity",
        type: "histogram",
        value: params.complexity,
        labels: {
          query_type: params.queryType,
        },
        timestamp: new Date(),
      });
    }
  }

  /**
   * Record an indexing operation
   */
  recordIndexing(params: {
    success: boolean;
    processingTimeMs: number;
    objectsIndexed: number;
    embeddingsGenerated: number;
    tenantId: string;
    cameraId: string;
  }): void {
    this.counters.indexing.total++;
    if (params.success) {
      this.counters.indexing.success++;
    } else {
      this.counters.indexing.failed++;
    }

    this.recordMetric({
      name: "video_indexing_jobs_total",
      type: "counter",
      value: 1,
      labels: {
        status: params.success ? "success" : "failure",
        tenant_id: params.tenantId,
      },
      timestamp: new Date(),
    });

    this.recordMetric({
      name: "video_indexing_processing_time_ms",
      type: "histogram",
      value: params.processingTimeMs,
      labels: {
        tenant_id: params.tenantId,
      },
      timestamp: new Date(),
    });

    this.recordMetric({
      name: "video_indexing_objects_indexed",
      type: "counter",
      value: params.objectsIndexed,
      labels: {
        tenant_id: params.tenantId,
      },
      timestamp: new Date(),
    });

    this.recordMetric({
      name: "video_indexing_embeddings_generated",
      type: "counter",
      value: params.embeddingsGenerated,
      labels: {
        tenant_id: params.tenantId,
      },
      timestamp: new Date(),
    });
  }

  /**
   * Record an error
   */
  recordError(params: {
    errorType: string;
    errorMessage: string;
    endpoint: string;
    tenantId?: string;
    severity: "low" | "medium" | "high" | "critical";
  }): void {
    this.counters.errors.total++;
    
    const typeCount = this.counters.errors.byType.get(params.errorType) || 0;
    this.counters.errors.byType.set(params.errorType, typeCount + 1);

    this.recordMetric({
      name: "video_search_errors_total",
      type: "counter",
      value: 1,
      labels: {
        error_type: params.errorType,
        endpoint: params.endpoint,
        severity: params.severity,
        tenant_id: params.tenantId || "unknown",
      },
      timestamp: new Date(),
    });

    // Emit alert for critical errors
    if (params.severity === "critical") {
      this.emit("critical_error", params);
    }
  }

  /**
   * Get search performance metrics
   */
  getSearchPerformanceMetrics(): SearchPerformanceMetrics {
    const sortedTimes = [...this.responseTimes].sort((a, b) => a - b);
    
    return {
      totalSearches: this.counters.searches.total,
      successfulSearches: this.counters.searches.success,
      failedSearches: this.counters.searches.failed,
      avgResponseTimeMs: sortedTimes.length > 0
        ? sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length
        : 0,
      p50ResponseTimeMs: this.getPercentile(sortedTimes, 0.5),
      p95ResponseTimeMs: this.getPercentile(sortedTimes, 0.95),
      p99ResponseTimeMs: this.getPercentile(sortedTimes, 0.99),
      throughputPerMinute: this.calculateThroughput(),
    };
  }

  /**
   * Get indexing performance metrics
   */
  async getIndexingPerformanceMetrics(tenantId?: string): Promise<IndexingPerformanceMetrics> {
    const conditions = tenantId ? "WHERE tenant_id = $1 AND" : "WHERE";
    const params = tenantId ? [tenantId] : [];

    const result = await this.pool.query(
      `SELECT 
         COUNT(*) as total_jobs,
         COUNT(*) FILTER (WHERE status = 'completed') as successful_jobs,
         COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
         AVG(processing_time_ms) FILTER (WHERE status = 'completed') as avg_processing_time,
         SUM(objects_indexed) FILTER (WHERE created_at >= NOW() - INTERVAL '1 minute') as objects_last_minute,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 minute') as jobs_last_minute
       FROM video_indexing_queue
       ${conditions} created_at >= NOW() - INTERVAL '1 hour'`,
      params
    );

    const row = result.rows[0];
    
    return {
      totalIndexingJobs: parseInt(row.total_jobs || "0"),
      successfulJobs: parseInt(row.successful_jobs || "0"),
      failedJobs: parseInt(row.failed_jobs || "0"),
      avgProcessingTimeMs: parseFloat(row.avg_processing_time || "0"),
      objectsIndexedPerMinute: parseInt(row.objects_last_minute || "0"),
      embeddingsGeneratedPerMinute: 0, // Would need separate tracking
    };
  }

  /**
   * Get error metrics
   */
  getErrorMetrics(): ErrorMetrics {
    const errorsByType: Record<string, number> = {};
    this.counters.errors.byType.forEach((count, type) => {
      errorsByType[type] = count;
    });

    const totalOperations = this.counters.searches.total + this.counters.indexing.total;
    const errorRate = totalOperations > 0 
      ? this.counters.errors.total / totalOperations 
      : 0;

    return {
      totalErrors: this.counters.errors.total,
      errorsByType,
      errorsByEndpoint: {}, // Would need separate tracking
      errorRate: parseFloat((errorRate * 100).toFixed(2)),
    };
  }

  /**
   * Get query analytics
   */
  getQueryAnalytics(): QueryAnalytics {
    const topQueries = Array.from(this.counters.queries.entries())
      .map(([query, stats]) => ({
        query,
        count: stats.count,
        avgResponseTime: stats.totalTime / stats.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return {
      topQueries,
      topAttributes: [], // Would need attribute tracking
      queryComplexityDistribution: {}, // Would need complexity tracking
      searchTypeDistribution: {}, // Would need type tracking
    };
  }

  /**
   * Get health status
   */
  async getHealthStatus(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    checks: Record<string, { status: string; message?: string }>;
  }> {
    const checks: Record<string, { status: string; message?: string }> = {};

    // Check database connectivity
    try {
      await this.pool.query("SELECT 1");
      checks.database = { status: "healthy" };
    } catch (error) {
      checks.database = { 
        status: "unhealthy", 
        message: error instanceof Error ? error.message : "Database connection failed" 
      };
    }

    // Check error rate
    const errorMetrics = this.getErrorMetrics();
    if (errorMetrics.errorRate > 10) {
      checks.error_rate = { status: "unhealthy", message: `Error rate: ${errorMetrics.errorRate}%` };
    } else if (errorMetrics.errorRate > 5) {
      checks.error_rate = { status: "degraded", message: `Error rate: ${errorMetrics.errorRate}%` };
    } else {
      checks.error_rate = { status: "healthy" };
    }

    // Check response time
    const perfMetrics = this.getSearchPerformanceMetrics();
    if (perfMetrics.p95ResponseTimeMs > 5000) {
      checks.response_time = { status: "unhealthy", message: `P95: ${perfMetrics.p95ResponseTimeMs}ms` };
    } else if (perfMetrics.p95ResponseTimeMs > 2000) {
      checks.response_time = { status: "degraded", message: `P95: ${perfMetrics.p95ResponseTimeMs}ms` };
    } else {
      checks.response_time = { status: "healthy" };
    }

    // Determine overall status
    const statuses = Object.values(checks).map(c => c.status);
    let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
    
    if (statuses.includes("unhealthy")) {
      overallStatus = "unhealthy";
    } else if (statuses.includes("degraded")) {
      overallStatus = "degraded";
    }

    return { status: overallStatus, checks };
  }

  /**
   * Calculate percentile
   */
  private getPercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    
    const index = Math.ceil(sortedValues.length * percentile) - 1;
    return sortedValues[Math.max(0, index)];
  }

  /**
   * Calculate throughput (requests per minute)
   */
  private calculateThroughput(): number {
    // Simple calculation based on recent activity
    // In production, would track timestamps for accurate calculation
    return this.counters.searches.total / 60; // Assuming 1-hour window
  }

  /**
   * Start periodic metrics flushing to database
   */
  private startMetricsFlushing(): void {
    setInterval(async () => {
      await this.flushMetrics();
    }, 60000); // Every minute
  }

  /**
   * Flush metrics to database
   */
  private async flushMetrics(): Promise<void> {
    try {
      // Store aggregated metrics in database for historical analysis
      const perfMetrics = this.getSearchPerformanceMetrics();
      const errorMetrics = this.getErrorMetrics();

      await this.pool.query(
        `INSERT INTO video_search_metrics_hourly (
           timestamp, total_searches, successful_searches, failed_searches,
           avg_response_time_ms, p95_response_time_ms, p99_response_time_ms,
           total_errors, error_rate, throughput_per_minute
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (timestamp) DO UPDATE SET
           total_searches = EXCLUDED.total_searches,
           successful_searches = EXCLUDED.successful_searches,
           failed_searches = EXCLUDED.failed_searches,
           avg_response_time_ms = EXCLUDED.avg_response_time_ms,
           p95_response_time_ms = EXCLUDED.p95_response_time_ms,
           p99_response_time_ms = EXCLUDED.p99_response_time_ms,
           total_errors = EXCLUDED.total_errors,
           error_rate = EXCLUDED.error_rate,
           throughput_per_minute = EXCLUDED.throughput_per_minute`,
        [
          new Date(Math.floor(Date.now() / 3600000) * 3600000), // Hour bucket
          perfMetrics.totalSearches,
          perfMetrics.successfulSearches,
          perfMetrics.failedSearches,
          perfMetrics.avgResponseTimeMs,
          perfMetrics.p95ResponseTimeMs,
          perfMetrics.p99ResponseTimeMs,
          errorMetrics.totalErrors,
          errorMetrics.errorRate,
          perfMetrics.throughputPerMinute,
        ]
      );
    } catch (error) {
      console.error("Failed to flush metrics:", error);
    }
  }

  /**
   * Start periodic aggregation
   */
  private startAggregation(): void {
    setInterval(() => {
      this.aggregateMetrics();
    }, 300000); // Every 5 minutes
  }

  /**
   * Aggregate metrics for reporting
   */
  private aggregateMetrics(): void {
    // Emit aggregated metrics for external monitoring systems
    const perfMetrics = this.getSearchPerformanceMetrics();
    const errorMetrics = this.getErrorMetrics();

    this.emit("aggregated_metrics", {
      performance: perfMetrics,
      errors: errorMetrics,
      timestamp: new Date(),
    });
  }

  /**
   * Reset counters (for testing)
   */
  reset(): void {
    this.counters.searches = { total: 0, success: 0, failed: 0 };
    this.counters.indexing = { total: 0, success: 0, failed: 0 };
    this.counters.errors = { total: 0, byType: new Map() };
    this.counters.queries.clear();
    this.responseTimes = [];
    this.metrics.clear();
  }
}

/**
 * Singleton metrics instance
 */
let metricsInstance: VideoSearchMetrics | null = null;

export function initializeMetrics(pool: Pool): VideoSearchMetrics {
  if (!metricsInstance) {
    metricsInstance = new VideoSearchMetrics(pool);
  }
  return metricsInstance;
}

export function getMetrics(): VideoSearchMetrics {
  if (!metricsInstance) {
    throw new Error("Metrics not initialized. Call initializeMetrics first.");
  }
  return metricsInstance;
}
