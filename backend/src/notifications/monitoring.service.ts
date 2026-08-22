/**
 * Notification Monitoring Service
 * 
 * Provides metrics, health checks, and observability
 * for the notification system
 */

import { Pool } from 'pg';
import {
  QueueDepthMetric,
  DeliveryStatsMetric,
  NotificationFailure
} from './notification.types.js';
import { ProviderRegistry } from './provider-registry.js';
import { NotificationWorkerRunner } from './notification-worker-runner.js';
import { logger } from '../utils/logger.js';

export class NotificationMonitoringService {
  constructor(
    private readonly pool: Pool,
    private readonly providers: ProviderRegistry,
    private readonly workerRunner: NotificationWorkerRunner
  ) {}

  /**
   * Get overall system health
   */
  async getHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: Date;
    components: {
      database: boolean;
      providers: Record<string, boolean>;
      workers: boolean;
      queueDepth: number;
      oldestPendingSeconds: number | null;
    };
  }> {
    try {
      // Check database
      const dbHealthy = await this.checkDatabase();

      // Check providers
      const providerHealth = await this.providers.healthCheck();
      const providersHealthy = Array.from(providerHealth.values()).every(h => h);

      // Check workers
      const workers = this.workerRunner.getMetrics();
      const workersHealthy = workers.every(w => 
        w.metrics.lastProcessedAt && 
        Date.now() - w.metrics.lastProcessedAt.getTime() < 60000
      );

      // Check queue depth
      const queueStats = await this.getQueueDepth();
      const totalPending = queueStats.reduce((sum, s) => sum + s.count, 0);
      
      // Get oldest pending
      const oldestPending = await this.getOldestPendingAge();

      // Determine overall status
      let status: 'healthy' | 'degraded' | 'unhealthy';
      
      if (!dbHealthy || totalPending > 10000) {
        status = 'unhealthy';
      } else if (!providersHealthy || !workersHealthy || totalPending > 1000) {
        status = 'degraded';
      } else {
        status = 'healthy';
      }

      return {
        status,
        timestamp: new Date(),
        components: {
          database: dbHealthy,
          providers: Object.fromEntries(providerHealth),
          workers: workersHealthy,
          queueDepth: totalPending,
          oldestPendingSeconds: oldestPending
        }
      };
    } catch (error) {
      logger.error('Health check failed', { error });
      
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        components: {
          database: false,
          providers: {},
          workers: false,
          queueDepth: -1,
          oldestPendingSeconds: null
        }
      };
    }
  }

  /**
   * Get queue depth metrics
   */
  async getQueueDepth(): Promise<QueueDepthMetric[]> {
    try {
      const result = await this.pool.query<QueueDepthMetric>(
        `SELECT 
          tenant_id as "tenantId",
          channel,
          status,
          priority,
          COUNT(*) as count,
          MIN(created_at) as "oldestPending"
        FROM notification_deliveries
        WHERE status IN ('pending', 'retry_wait')
        GROUP BY tenant_id, channel, status, priority
        ORDER BY count DESC`
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get queue depth', { error });
      return [];
    }
  }

  /**
   * Get delivery statistics for last 24 hours
   */
  async getDeliveryStats(): Promise<DeliveryStatsMetric[]> {
    try {
      const result = await this.pool.query<DeliveryStatsMetric>(
        `SELECT 
          tenant_id as "tenantId",
          channel,
          provider,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
          COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          AVG(EXTRACT(EPOCH FROM (delivered_at - created_at))) as "avgDeliveryTimeSeconds"
        FROM notification_deliveries
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY tenant_id, channel, provider
        ORDER BY total DESC`
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get delivery stats', { error });
      return [];
    }
  }

  /**
   * Get recent failures
   */
  async getRecentFailures(limit: number = 50): Promise<NotificationFailure[]> {
    try {
      const result = await this.pool.query<NotificationFailure>(
        `SELECT 
          nd.id,
          nd.tenant_id as "tenantId",
          n.type as "notificationType",
          nd.channel,
          nd.destination,
          nd.attempt_count as "attemptCount",
          nd.last_error as "lastError",
          nd.failed_at as "failedAt",
          nd.created_at as "createdAt"
        FROM notification_deliveries nd
        JOIN notifications n ON n.id = nd.notification_id
        WHERE nd.status = 'failed'
        ORDER BY nd.failed_at DESC
        LIMIT $1`,
        [limit]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get recent failures', { error });
      return [];
    }
  }

  /**
   * Get worker metrics
   */
  getWorkerMetrics() {
    return this.workerRunner.getMetrics();
  }

  /**
   * Get provider health
   */
  async getProviderHealth() {
    return this.providers.healthCheck();
  }

  /**
   * Get Prometheus-style metrics
   */
  async getPrometheusMetrics(): Promise<string> {
    const metrics: string[] = [];

    try {
      // Queue depth
      const queueDepth = await this.getQueueDepth();
      for (const metric of queueDepth) {
        metrics.push(
          `notification_queue_depth{tenant="${metric.tenantId}",channel="${metric.channel}",status="${metric.status}",priority="${metric.priority}"} ${metric.count}`
        );
      }

      // Delivery stats
      const stats = await this.getDeliveryStats();
      for (const stat of stats) {
        metrics.push(
          `notification_delivery_total{tenant="${stat.tenantId}",channel="${stat.channel}",provider="${stat.provider || 'unknown'}",status="total"} ${stat.total}`
        );
        metrics.push(
          `notification_delivery_total{tenant="${stat.tenantId}",channel="${stat.channel}",provider="${stat.provider || 'unknown'}",status="delivered"} ${stat.delivered}`
        );
        metrics.push(
          `notification_delivery_total{tenant="${stat.tenantId}",channel="${stat.channel}",provider="${stat.provider || 'unknown'}",status="failed"} ${stat.failed}`
        );
        
        if (stat.avgDeliveryTimeSeconds) {
          metrics.push(
            `notification_delivery_duration_seconds{tenant="${stat.tenantId}",channel="${stat.channel}",provider="${stat.provider || 'unknown'}"} ${stat.avgDeliveryTimeSeconds.toFixed(2)}`
          );
        }
      }

      // Worker metrics
      const workers = this.workerRunner.getMetrics();
      for (const worker of workers) {
        metrics.push(
          `notification_worker_jobs_processed{worker="${worker.workerId}"} ${worker.metrics.jobsProcessed}`
        );
        metrics.push(
          `notification_worker_jobs_succeeded{worker="${worker.workerId}"} ${worker.metrics.jobsSucceeded}`
        );
        metrics.push(
          `notification_worker_jobs_failed{worker="${worker.workerId}"} ${worker.metrics.jobsFailed}`
        );
        metrics.push(
          `notification_worker_processing_time_ms{worker="${worker.workerId}"} ${worker.metrics.averageProcessingTimeMs.toFixed(2)}`
        );
      }

      // Oldest pending
      const oldestPending = await this.getOldestPendingAge();
      if (oldestPending !== null) {
        metrics.push(
          `notification_oldest_pending_seconds ${oldestPending}`
        );
      }

      return metrics.join('\n') + '\n';
    } catch (error) {
      logger.error('Failed to generate Prometheus metrics', { error });
      return '# Error generating metrics\n';
    }
  }

  /**
   * Check database connectivity
   */
  private async checkDatabase(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch (error) {
      logger.error('Database health check failed', { error });
      return false;
    }
  }

  /**
   * Get age of oldest pending delivery in seconds
   */
  private async getOldestPendingAge(): Promise<number | null> {
    try {
      const result = await this.pool.query(
        `SELECT 
          EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) as age_seconds
        FROM notification_deliveries
        WHERE status IN ('pending', 'retry_wait')`
      );

      return result.rows[0]?.age_seconds || null;
    } catch (error) {
      logger.error('Failed to get oldest pending age', { error });
      return null;
    }
  }

  /**
   * Generate daily summary report
   */
  async getDailySummary(tenantId?: string): Promise<{
    date: Date;
    totalNotifications: number;
    totalDeliveries: number;
    successRate: number;
    byChannel: Record<string, {
      total: number;
      delivered: number;
      failed: number;
      successRate: number;
    }>;
    topFailureReasons: Array<{
      errorCode: string;
      count: number;
    }>;
  }> {
    try {
      const tenantFilter = tenantId ? 'AND tenant_id = $1' : '';
      const params = tenantId ? [tenantId] : [];

      // Overall stats
      const overallResult = await this.pool.query(
        `SELECT 
          COUNT(DISTINCT notification_id) as total_notifications,
          COUNT(*) as total_deliveries,
          COUNT(*) FILTER (WHERE status IN ('delivered', 'accepted')) as successful,
          COUNT(*) FILTER (WHERE status = 'failed') as failed
        FROM notification_deliveries
        WHERE created_at >= CURRENT_DATE ${tenantFilter}`,
        params
      );

      const overall = overallResult.rows[0];

      // By channel
      const channelResult = await this.pool.query(
        `SELECT 
          channel,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status IN ('delivered', 'accepted')) as delivered,
          COUNT(*) FILTER (WHERE status = 'failed') as failed
        FROM notification_deliveries
        WHERE created_at >= CURRENT_DATE ${tenantFilter}
        GROUP BY channel`,
        params
      );

      const byChannel: Record<string, any> = {};
      for (const row of channelResult.rows) {
        byChannel[row.channel] = {
          total: parseInt(row.total),
          delivered: parseInt(row.delivered),
          failed: parseInt(row.failed),
          successRate: row.total > 0 
            ? (row.delivered / row.total) * 100 
            : 0
        };
      }

      // Top failure reasons
      const failureResult = await this.pool.query(
        `SELECT 
          last_error_code as error_code,
          COUNT(*) as count
        FROM notification_deliveries
        WHERE created_at >= CURRENT_DATE
          AND status = 'failed'
          AND last_error_code IS NOT NULL
          ${tenantFilter}
        GROUP BY last_error_code
        ORDER BY count DESC
        LIMIT 10`,
        params
      );

      return {
        date: new Date(),
        totalNotifications: parseInt(overall.total_notifications),
        totalDeliveries: parseInt(overall.total_deliveries),
        successRate: overall.total_deliveries > 0
          ? (overall.successful / overall.total_deliveries) * 100
          : 0,
        byChannel,
        topFailureReasons: failureResult.rows.map(r => ({
          errorCode: r.error_code,
          count: parseInt(r.count)
        }))
      };
    } catch (error) {
      logger.error('Failed to generate daily summary', { error, tenantId });
      throw error;
    }
  }
}
