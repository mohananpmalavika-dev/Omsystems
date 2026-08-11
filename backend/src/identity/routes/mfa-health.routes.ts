/**
 * MFA Health and Metrics API Routes
 * 
 * Endpoints for monitoring MFA system health:
 * - /health - Overall MFA health status
 * - /health/providers - SMS/Email provider health
 * - /health/queue - Notification queue depth
 * - /metrics - Comprehensive metrics
 * - /metrics/prometheus - Prometheus-formatted metrics
 */

import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { MfaMetricsService } from '../services/mfa-metrics.service.js';
import { createSmsProvider, loadSmsProviderConfig } from '../sms/sms-provider.interface.js';
import { NotificationOutboxRepository } from '../repositories/notification-outbox.repository.js';
import { MfaChallengeRepository } from '../repositories/mfa-challenge.repository.js';
import { logger } from '../../utils/logger.js';

export function createMfaHealthRoutes(pool: Pool): express.Router {
  const router = express.Router();
  const metricsService = new MfaMetricsService(pool);
  const outboxRepo = new NotificationOutboxRepository(pool);
  const challengeRepo = new MfaChallengeRepository(pool);

  /**
   * GET /health
   * Overall MFA system health check
   */
  router.get('/health', async (req: Request, res: Response) => {
    try {
      const smsConfig = loadSmsProviderConfig();
      const smsProvider = createSmsProvider(smsConfig);

      // Check SMS provider health
      const providerHealth = await smsProvider.healthCheck();

      // Check queue depth
      const queueDepth = await metricsService.getQueueDepth();

      // Check for stuck messages
      const stuckMessages = await outboxRepo.resetStuckMessages(10);

      // Overall health determination
      const healthy = providerHealth.healthy && queueDepth.pending < 1000;

      const response = {
        status: healthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        components: {
          smsProvider: {
            name: smsProvider.name,
            configured: smsProvider.isConfigured(),
            healthy: providerHealth.healthy,
            reason: providerHealth.reason,
            latencyMs: providerHealth.latencyMs,
          },
          notificationQueue: {
            healthy: queueDepth.pending < 1000,
            pending: queueDepth.pending,
            processing: queueDepth.processing,
            byChannel: queueDepth.byChannel,
          },
          database: {
            healthy: true, // If we got here, DB is responsive
          },
        },
        issues: [] as string[],
      };

      if (!providerHealth.healthy) {
        response.issues.push(`SMS provider unhealthy: ${providerHealth.reason}`);
      }

      if (queueDepth.pending >= 1000) {
        response.issues.push(`High queue depth: ${queueDepth.pending} pending messages`);
      }

      if (stuckMessages > 0) {
        response.issues.push(`Reset ${stuckMessages} stuck messages`);
      }

      const statusCode = healthy ? 200 : 503;
      res.status(statusCode).json(response);
    } catch (error) {
      logger.error('Health check failed', { error });

      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /health/providers
   * Detailed provider health information
   */
  router.get('/health/providers', async (req: Request, res: Response) => {
    try {
      const smsConfig = loadSmsProviderConfig();
      const smsProvider = createSmsProvider(smsConfig);

      const [smsHealth, dbHealth] = await Promise.all([
        smsProvider.healthCheck(),
        pool.query('SELECT NOW()'),
      ]);

      res.json({
        providers: {
          sms: {
            name: smsProvider.name,
            configured: smsProvider.isConfigured(),
            healthy: smsHealth.healthy,
            reason: smsHealth.reason,
            latencyMs: smsHealth.latencyMs,
            details: smsHealth.details,
          },
          // Future: email provider health
        },
        database: {
          healthy: true,
          latencyMs: 0, // Could measure query time
        },
      });
    } catch (error) {
      logger.error('Provider health check failed', { error });
      res.status(500).json({ error: 'Failed to check provider health' });
    }
  });

  /**
   * GET /health/queue
   * Notification queue status
   */
  router.get('/health/queue', async (req: Request, res: Response) => {
    try {
      const queueDepth = await metricsService.getQueueDepth();

      // Get oldest pending message
      const oldestPending = await pool.query(
        `SELECT created_at, channel, attempt_count
         FROM notification_outbox
         WHERE status = 'pending'
         ORDER BY created_at ASC
         LIMIT 1`
      );

      const oldest = oldestPending.rows[0];
      const ageMinutes = oldest
        ? Math.floor((Date.now() - new Date(oldest.created_at).getTime()) / 60000)
        : 0;

      res.json({
        queue: queueDepth,
        oldestPendingMessage: oldest
          ? {
              ageMinutes,
              channel: oldest.channel,
              attemptCount: oldest.attempt_count,
            }
          : null,
        health: {
          healthy: queueDepth.pending < 1000 && ageMinutes < 5,
          warnings: [] as string[],
        },
      });

      if (queueDepth.pending >= 1000) {
        res.json().health.warnings.push('High queue depth');
      }

      if (ageMinutes >= 5) {
        res.json().health.warnings.push('Old messages in queue');
      }
    } catch (error) {
      logger.error('Queue health check failed', { error });
      res.status(500).json({ error: 'Failed to check queue health' });
    }
  });

  /**
   * GET /metrics
   * Comprehensive MFA metrics
   */
  router.get('/metrics', async (req: Request, res: Response) => {
    try {
      const since = req.query.since
        ? new Date(req.query.since as string)
        : new Date(Date.now() - 3600000); // Last hour by default

      const metrics = await metricsService.getMetrics(since);

      res.json({
        metrics,
        period: {
          since: since.toISOString(),
          until: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to get metrics', { error });
      res.status(500).json({ error: 'Failed to retrieve metrics' });
    }
  });

  /**
   * GET /metrics/prometheus
   * Prometheus-formatted metrics
   */
  router.get('/metrics/prometheus', async (req: Request, res: Response) => {
    try {
      const since = req.query.since
        ? new Date(req.query.since as string)
        : undefined;

      const prometheusMetrics = await metricsService.getPrometheusMetrics(since);

      res.set('Content-Type', 'text/plain; version=0.0.4');
      res.send(prometheusMetrics);
    } catch (error) {
      logger.error('Failed to get Prometheus metrics', { error });
      res.status(500).send('# Error generating metrics\n');
    }
  });

  /**
   * GET /metrics/challenges
   * Challenge-specific metrics
   */
  router.get('/metrics/challenges', async (req: Request, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT 
          status,
          method,
          COUNT(*) as count,
          AVG(EXTRACT(EPOCH FROM (COALESCE(verified_at, NOW()) - created_at))) as avg_time_to_verify_seconds
        FROM mfa_challenges
        WHERE created_at > NOW() - INTERVAL '1 hour'
        GROUP BY status, method
        ORDER BY count DESC
      `);

      res.json({
        challenges: result.rows,
        period: 'last_hour',
      });
    } catch (error) {
      logger.error('Failed to get challenge metrics', { error });
      res.status(500).json({ error: 'Failed to retrieve challenge metrics' });
    }
  });

  /**
   * POST /health/maintenance/cleanup
   * Trigger cleanup operations (admin only)
   */
  router.post('/health/maintenance/cleanup', async (req: Request, res: Response) => {
    try {
      // TODO: Add authentication/authorization check

      const [
        expiredChallenges,
        expiredMessages,
        stuckMessages,
        oldChallenges,
        oldMessages,
      ] = await Promise.all([
        challengeRepo.markExpiredChallenges(),
        outboxRepo.markExpiredMessages(),
        outboxRepo.resetStuckMessages(10),
        challengeRepo.deleteOldChallenges(30),
        outboxRepo.deleteOldMessages(7),
      ]);

      res.json({
        cleanup: {
          expiredChallenges,
          expiredMessages,
          stuckMessages,
          deletedChallenges: oldChallenges,
          deletedMessages: oldMessages,
        },
      });
    } catch (error) {
      logger.error('Cleanup failed', { error });
      res.status(500).json({ error: 'Cleanup operation failed' });
    }
  });

  /**
   * GET /health/diagnostics
   * Detailed diagnostic information
   */
  router.get('/health/diagnostics', async (req: Request, res: Response) => {
    try {
      const [
        challengesByStatus,
        messagesByStatus,
        providerStats,
        rateLimitStats,
      ] = await Promise.all([
        pool.query(`
          SELECT status, COUNT(*) as count
          FROM mfa_challenges
          WHERE created_at > NOW() - INTERVAL '24 hours'
          GROUP BY status
        `),
        pool.query(`
          SELECT status, channel, COUNT(*) as count
          FROM notification_outbox
          WHERE created_at > NOW() - INTERVAL '24 hours'
          GROUP BY status, channel
        `),
        pool.query(`
          SELECT provider, channel, healthy, consecutive_failures,
                 recent_success_count, recent_failure_count
          FROM mfa_provider_health
        `),
        pool.query(`
          SELECT limit_type, operation, COUNT(*) as count,
                 AVG(attempt_count) as avg_attempts
          FROM mfa_rate_limits
          WHERE expires_at > NOW()
          GROUP BY limit_type, operation
        `),
      ]);

      res.json({
        challenges: {
          byStatus: challengesByStatus.rows,
        },
        messages: {
          byStatus: messagesByStatus.rows,
        },
        providers: providerStats.rows,
        rateLimits: rateLimitStats.rows,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Diagnostics failed', { error });
      res.status(500).json({ error: 'Failed to retrieve diagnostics' });
    }
  });

  return router;
}
