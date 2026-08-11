/**
 * MFA Metrics Service
 * 
 * Tracks and exposes metrics for MFA operations:
 * - Challenge creation, delivery, verification, consumption rates
 * - Success/failure rates by method and provider
 * - Latency distributions
 * - Rate limit violations
 * - Provider health tracking
 * 
 * Metrics can be exposed via:
 * - Prometheus endpoint
 * - Internal health API
 * - Real-time dashboard
 */

import { Pool } from 'pg';
import { logger } from '../../utils/logger.js';

export interface MfaMetrics {
  // Challenge metrics
  challengesCreated: MetricCounter;
  challengesQueued: MetricCounter;
  challengesSent: MetricCounter;
  challengesVerified: MetricCounter;
  challengesConsumed: MetricCounter;
  challengesFailed: MetricCounter;
  challengesExpired: MetricCounter;
  challengesLocked: MetricCounter;

  // Verification metrics
  verificationAttempts: MetricCounter;
  verificationSuccesses: MetricCounter;
  verificationFailures: MetricCounter;

  // Delivery metrics
  deliveryAttempts: MetricCounter;
  deliverySuccesses: MetricCounter;
  deliveryFailures: MetricCounter;
  deliveryRetries: MetricCounter;

  // Latency metrics
  deliveryLatencyMs: MetricHistogram;
  verificationLatencyMs: MetricHistogram;

  // Rate limit metrics
  rateLimitViolations: MetricCounter;

  // Provider health
  providerHealthy: MetricGauge;
  providerLatencyMs: MetricHistogram;
}

export interface MetricCounter {
  total: number;
  byMethod?: Record<string, number>;
  byProvider?: Record<string, number>;
  byTenant?: Record<string, number>;
  byErrorCode?: Record<string, number>;
}

export interface MetricHistogram {
  count: number;
  sum: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

export interface MetricGauge {
  value: number;
  byProvider?: Record<string, number>;
}

export class MfaMetricsService {
  constructor(private readonly pool: Pool) {}

  /**
   * Get comprehensive MFA metrics
   */
  async getMetrics(since?: Date): Promise<MfaMetrics> {
    const sinceClause = since
      ? `WHERE created_at >= $1`
      : '';
    const params = since ? [since] : [];

    // Run queries in parallel
    const [
      challengeStats,
      verificationStats,
      deliveryStats,
      latencyStats,
      rateLimitStats,
      providerHealth,
    ] = await Promise.all([
      this.getChallengeStats(sinceClause, params),
      this.getVerificationStats(sinceClause, params),
      this.getDeliveryStats(sinceClause, params),
      this.getLatencyStats(sinceClause, params),
      this.getRateLimitStats(sinceClause, params),
      this.getProviderHealth(),
    ]);

    return {
      ...challengeStats,
      ...verificationStats,
      ...deliveryStats,
      ...latencyStats,
      ...rateLimitStats,
      ...providerHealth,
    };
  }

  /**
   * Get challenge statistics
   */
  private async getChallengeStats(
    sinceClause: string,
    params: any[]
  ): Promise<Partial<MfaMetrics>> {
    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'CREATED') as created,
        COUNT(*) FILTER (WHERE status = 'QUEUED') as queued,
        COUNT(*) FILTER (WHERE status = 'SENT') as sent,
        COUNT(*) FILTER (WHERE status = 'VERIFIED') as verified,
        COUNT(*) FILTER (WHERE status = 'CONSUMED') as consumed,
        COUNT(*) FILTER (WHERE status = 'DELIVERY_FAILED') as failed,
        COUNT(*) FILTER (WHERE status = 'EXPIRED') as expired,
        COUNT(*) FILTER (WHERE status = 'LOCKED') as locked,
        method,
        provider,
        tenant_id
      FROM mfa_challenges
      ${sinceClause}
      GROUP BY ROLLUP(method, provider, tenant_id)
    `;

    const result = await this.pool.query(query, params);

    return this.aggregateChallengeStats(result.rows);
  }

  /**
   * Get verification statistics
   */
  private async getVerificationStats(
    sinceClause: string,
    params: any[]
  ): Promise<Partial<MfaMetrics>> {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE success = true) as successes,
        COUNT(*) FILTER (WHERE success = false) as failures,
        method
      FROM mfa_verification_log
      ${sinceClause}
      GROUP BY ROLLUP(method)
    `;

    const result = await this.pool.query(query, params);

    return this.aggregateVerificationStats(result.rows);
  }

  /**
   * Get delivery statistics
   */
  private async getDeliveryStats(
    sinceClause: string,
    params: any[]
  ): Promise<Partial<MfaMetrics>> {
    const query = `
      SELECT 
        COUNT(*) as attempts,
        COUNT(*) FILTER (WHERE status = 'sent') as successes,
        COUNT(*) FILTER (WHERE status = 'failed') as failures,
        SUM(attempt_count - 1) FILTER (WHERE attempt_count > 1) as retries,
        channel,
        provider,
        last_error_code
      FROM notification_outbox
      ${sinceClause}
      GROUP BY ROLLUP(channel, provider, last_error_code)
    `;

    const result = await this.pool.query(query, params);

    return this.aggregateDeliveryStats(result.rows);
  }

  /**
   * Get latency statistics
   */
  private async getLatencyStats(
    sinceClause: string,
    params: any[]
  ): Promise<Partial<MfaMetrics>> {
    // Delivery latency (time from created to sent)
    const deliveryQuery = `
      SELECT 
        EXTRACT(EPOCH FROM (sent_at - created_at)) * 1000 as latency_ms
      FROM notification_outbox
      WHERE sent_at IS NOT NULL
        ${sinceClause ? 'AND ' + sinceClause : ''}
    `;

    // Verification latency (time from sent to verified)
    const verificationQuery = `
      SELECT 
        EXTRACT(EPOCH FROM (verified_at - created_at)) * 1000 as latency_ms
      FROM mfa_challenges
      WHERE verified_at IS NOT NULL
        ${sinceClause ? 'AND ' + sinceClause : ''}
    `;

    const [deliveryResult, verificationResult] = await Promise.all([
      this.pool.query(deliveryQuery, params),
      this.pool.query(verificationQuery, params),
    ]);

    return {
      deliveryLatencyMs: this.calculateHistogram(
        deliveryResult.rows.map(r => r.latency_ms)
      ),
      verificationLatencyMs: this.calculateHistogram(
        verificationResult.rows.map(r => r.latency_ms)
      ),
    };
  }

  /**
   * Get rate limit violation statistics
   */
  private async getRateLimitStats(
    sinceClause: string,
    params: any[]
  ): Promise<Partial<MfaMetrics>> {
    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE attempt_count >= max_attempts) as violations,
        limit_type,
        operation
      FROM mfa_rate_limits
      ${sinceClause ? 'WHERE ' + sinceClause.replace('created_at', 'created_at') : ''}
      GROUP BY ROLLUP(limit_type, operation)
    `;

    const result = await this.pool.query(query, params);

    const total = result.rows.find(r => !r.limit_type)?.violations || 0;

    return {
      rateLimitViolations: {
        total: parseInt(total),
      },
    };
  }

  /**
   * Get provider health status
   */
  private async getProviderHealth(): Promise<Partial<MfaMetrics>> {
    const result = await this.pool.query(`
      SELECT 
        provider,
        channel,
        healthy,
        avg_latency_ms,
        recent_success_count,
        recent_failure_count,
        consecutive_failures
      FROM mfa_provider_health
      WHERE last_check_at > NOW() - INTERVAL '5 minutes'
    `);

    const providerHealthy: Record<string, number> = {};
    const latencies: number[] = [];

    for (const row of result.rows) {
      providerHealthy[row.provider] = row.healthy ? 1 : 0;
      
      if (row.avg_latency_ms) {
        latencies.push(row.avg_latency_ms);
      }
    }

    return {
      providerHealthy: {
        value: Object.values(providerHealthy).every(v => v === 1) ? 1 : 0,
        byProvider: providerHealthy,
      },
      providerLatencyMs: this.calculateHistogram(latencies),
    };
  }

  /**
   * Update provider health status
   */
  async updateProviderHealth(
    provider: string,
    channel: string,
    healthy: boolean,
    latencyMs?: number,
    error?: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO mfa_provider_health (
        provider, channel, healthy, last_check_at,
        avg_latency_ms, last_error,
        consecutive_failures,
        recent_send_count, recent_success_count, recent_failure_count
      ) VALUES ($1, $2, $3, NOW(), $4, $5, 
        CASE WHEN $3 = false THEN 1 ELSE 0 END,
        1, CASE WHEN $3 = true THEN 1 ELSE 0 END, CASE WHEN $3 = false THEN 1 ELSE 0 END
      )
      ON CONFLICT (provider, channel) 
      DO UPDATE SET
        healthy = $3,
        last_check_at = NOW(),
        avg_latency_ms = COALESCE($4, mfa_provider_health.avg_latency_ms),
        last_error = COALESCE($5, mfa_provider_health.last_error),
        consecutive_failures = CASE 
          WHEN $3 = true THEN 0
          ELSE mfa_provider_health.consecutive_failures + 1
        END,
        last_success_at = CASE 
          WHEN $3 = true THEN NOW()
          ELSE mfa_provider_health.last_success_at
        END,
        recent_send_count = mfa_provider_health.recent_send_count + 1,
        recent_success_count = mfa_provider_health.recent_success_count + 
          CASE WHEN $3 = true THEN 1 ELSE 0 END,
        recent_failure_count = mfa_provider_health.recent_failure_count + 
          CASE WHEN $3 = false THEN 1 ELSE 0 END,
        updated_at = NOW()`,
      [provider, channel, healthy, latencyMs || null, error || null]
    );

    if (!healthy) {
      logger.warn('Provider health degraded', {
        provider,
        channel,
        error,
      });
    }
  }

  /**
   * Get current challenge queue depth
   */
  async getQueueDepth(): Promise<{
    pending: number;
    processing: number;
    byChannel: Record<string, { pending: number; processing: number }>;
  }> {
    const result = await this.pool.query(`
      SELECT 
        channel,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing
      FROM notification_outbox
      WHERE status IN ('pending', 'processing')
      GROUP BY ROLLUP(channel)
    `);

    const total = result.rows.find(r => !r.channel);
    const byChannel: Record<string, any> = {};

    for (const row of result.rows) {
      if (row.channel) {
        byChannel[row.channel] = {
          pending: parseInt(row.pending),
          processing: parseInt(row.processing),
        };
      }
    }

    return {
      pending: parseInt(total?.pending || 0),
      processing: parseInt(total?.processing || 0),
      byChannel,
    };
  }

  /**
   * Helper: Aggregate challenge stats
   */
  private aggregateChallengeStats(rows: any[]): Partial<MfaMetrics> {
    const totals = rows.find(r => !r.method && !r.provider && !r.tenant_id) || {};

    return {
      challengesCreated: { total: parseInt(totals.created || 0) },
      challengesQueued: { total: parseInt(totals.queued || 0) },
      challengesSent: { total: parseInt(totals.sent || 0) },
      challengesVerified: { total: parseInt(totals.verified || 0) },
      challengesConsumed: { total: parseInt(totals.consumed || 0) },
      challengesFailed: { total: parseInt(totals.failed || 0) },
      challengesExpired: { total: parseInt(totals.expired || 0) },
      challengesLocked: { total: parseInt(totals.locked || 0) },
    };
  }

  /**
   * Helper: Aggregate verification stats
   */
  private aggregateVerificationStats(rows: any[]): Partial<MfaMetrics> {
    const totals = rows.find(r => !r.method) || {};

    return {
      verificationAttempts: { total: parseInt(totals.total || 0) },
      verificationSuccesses: { total: parseInt(totals.successes || 0) },
      verificationFailures: { total: parseInt(totals.failures || 0) },
    };
  }

  /**
   * Helper: Aggregate delivery stats
   */
  private aggregateDeliveryStats(rows: any[]): Partial<MfaMetrics> {
    const totals = rows.find(r => !r.channel && !r.provider) || {};

    return {
      deliveryAttempts: { total: parseInt(totals.attempts || 0) },
      deliverySuccesses: { total: parseInt(totals.successes || 0) },
      deliveryFailures: { total: parseInt(totals.failures || 0) },
      deliveryRetries: { total: parseInt(totals.retries || 0) },
    };
  }

  /**
   * Helper: Calculate histogram from values
   */
  private calculateHistogram(values: number[]): MetricHistogram {
    if (values.length === 0) {
      return {
        count: 0,
        sum: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        min: 0,
        max: 0,
      };
    }

    const sorted = values.sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);

    return {
      count: sorted.length,
      sum,
      avg: sum / sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
    };
  }

  /**
   * Get Prometheus-formatted metrics
   */
  async getPrometheusMetrics(since?: Date): Promise<string> {
    const metrics = await this.getMetrics(since);
    const lines: string[] = [];

    // Challenge metrics
    lines.push('# HELP mfa_challenges_total Total MFA challenges by status');
    lines.push('# TYPE mfa_challenges_total counter');
    lines.push(`mfa_challenges_total{status="created"} ${metrics.challengesCreated.total}`);
    lines.push(`mfa_challenges_total{status="queued"} ${metrics.challengesQueued.total}`);
    lines.push(`mfa_challenges_total{status="sent"} ${metrics.challengesSent.total}`);
    lines.push(`mfa_challenges_total{status="verified"} ${metrics.challengesVerified.total}`);
    lines.push(`mfa_challenges_total{status="consumed"} ${metrics.challengesConsumed.total}`);
    lines.push(`mfa_challenges_total{status="failed"} ${metrics.challengesFailed.total}`);
    lines.push(`mfa_challenges_total{status="expired"} ${metrics.challengesExpired.total}`);
    lines.push(`mfa_challenges_total{status="locked"} ${metrics.challengesLocked.total}`);

    // Verification metrics
    lines.push('# HELP mfa_verification_attempts_total Total verification attempts');
    lines.push('# TYPE mfa_verification_attempts_total counter');
    lines.push(`mfa_verification_attempts_total ${metrics.verificationAttempts.total}`);
    lines.push(`mfa_verification_attempts_total{result="success"} ${metrics.verificationSuccesses.total}`);
    lines.push(`mfa_verification_attempts_total{result="failure"} ${metrics.verificationFailures.total}`);

    // Delivery metrics
    lines.push('# HELP mfa_delivery_attempts_total Total delivery attempts');
    lines.push('# TYPE mfa_delivery_attempts_total counter');
    lines.push(`mfa_delivery_attempts_total ${metrics.deliveryAttempts.total}`);
    lines.push(`mfa_delivery_attempts_total{result="success"} ${metrics.deliverySuccesses.total}`);
    lines.push(`mfa_delivery_attempts_total{result="failure"} ${metrics.deliveryFailures.total}`);

    // Provider health
    lines.push('# HELP mfa_provider_healthy Provider health status (1=healthy, 0=unhealthy)');
    lines.push('# TYPE mfa_provider_healthy gauge');
    if (metrics.providerHealthy.byProvider) {
      for (const [provider, value] of Object.entries(metrics.providerHealthy.byProvider)) {
        lines.push(`mfa_provider_healthy{provider="${provider}"} ${value}`);
      }
    }

    // Latency
    lines.push('# HELP mfa_delivery_latency_seconds Delivery latency histogram');
    lines.push('# TYPE mfa_delivery_latency_seconds histogram');
    lines.push(`mfa_delivery_latency_seconds_sum ${metrics.deliveryLatencyMs.sum / 1000}`);
    lines.push(`mfa_delivery_latency_seconds_count ${metrics.deliveryLatencyMs.count}`);

    return lines.join('\n');
  }
}
