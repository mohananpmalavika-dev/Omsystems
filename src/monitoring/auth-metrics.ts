/**
 * Authentication Metrics and Monitoring
 * 
 * Provides metrics collection and monitoring for enterprise authentication.
 */

import type { Pool } from 'pg';

/**
 * Authentication metrics
 */
export interface AuthMetrics {
  /**
   * Authentication success rate by provider
   */
  successRateByProvider: Record<string, {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
  }>;

  /**
   * Authentication latency by provider (milliseconds)
   */
  latencyByProvider: Record<string, {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  }>;

  /**
   * JIT provisioning metrics
   */
  jitProvisioning: {
    total: number;
    created: number;
    linked: number;
    failed: number;
  };

  /**
   * Role mapping metrics
   */
  roleMapping: {
    total: number;
    mapped: number;
    unmapped: number;
    failed: number;
  };

  /**
   * Active sessions
   */
  activeSessions: {
    total: number;
    byProvider: Record<string, number>;
    byAuthMethod: Record<string, number>;
  };

  /**
   * Session metrics
   */
  sessions: {
    created: number;
    refreshed: number;
    revoked: number;
    expired: number;
  };

  /**
   * Error distribution
   */
  errors: Record<string, number>;
}

/**
 * Time range for metrics
 */
export type MetricTimeRange = '1h' | '24h' | '7d' | '30d';

/**
 * Authentication Metrics Service
 */
export class AuthMetricsService {
  constructor(private pool: Pool) {}

  /**
   * Get authentication metrics for time range
   */
  async getMetrics(timeRange: MetricTimeRange = '24h'): Promise<AuthMetrics> {
    const interval = this.getInterval(timeRange);

    const [
      successRate,
      jitProvisioning,
      roleMapping,
      activeSessions,
      sessionMetrics,
      errors,
    ] = await Promise.all([
      this.getSuccessRate(interval),
      this.getJITProvisioningMetrics(interval),
      this.getRoleMappingMetrics(interval),
      this.getActiveSessions(),
      this.getSessionMetrics(interval),
      this.getErrorDistribution(interval),
    ]);

    return {
      successRateByProvider: successRate,
      latencyByProvider: {}, // Would be populated from performance logs
      jitProvisioning,
      roleMapping,
      activeSessions,
      sessions: sessionMetrics,
      errors,
    };
  }

  /**
   * Get authentication success rate by provider
   */
  private async getSuccessRate(interval: string): Promise<Record<string, any>> {
    const result = await this.pool.query(`
      SELECT 
        provider_id,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE event_type = 'ENTERPRISE_LOGIN_SUCCESS') as successful,
        COUNT(*) FILTER (WHERE event_type = 'ENTERPRISE_LOGIN_FAILURE') as failed
      FROM audit_events
      WHERE event_type IN ('ENTERPRISE_LOGIN_SUCCESS', 'ENTERPRISE_LOGIN_FAILURE')
        AND created_at > now() - $1::interval
      GROUP BY provider_id
    `, [interval]);

    const metrics: Record<string, any> = {};

    for (const row of result.rows) {
      metrics[row.provider_id] = {
        total: parseInt(row.total),
        successful: parseInt(row.successful),
        failed: parseInt(row.failed),
        successRate: row.total > 0 ? (row.successful / row.total) * 100 : 0,
      };
    }

    return metrics;
  }

  /**
   * Get JIT provisioning metrics
   */
  private async getJITProvisioningMetrics(interval: string): Promise<any> {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE event_type = 'USER_PROVISIONED') as created,
        COUNT(*) FILTER (WHERE event_type = 'USER_LINKED') as linked,
        COUNT(*) FILTER (WHERE event_type = 'PROVISIONING_FAILED') as failed
      FROM audit_events
      WHERE event_type IN ('USER_PROVISIONED', 'USER_LINKED', 'PROVISIONING_FAILED')
        AND created_at > now() - $1::interval
    `, [interval]);

    const row = result.rows[0];

    return {
      total: parseInt(row.created) + parseInt(row.linked) + parseInt(row.failed),
      created: parseInt(row.created),
      linked: parseInt(row.linked),
      failed: parseInt(row.failed),
    };
  }

  /**
   * Get role mapping metrics
   */
  private async getRoleMappingMetrics(interval: string): Promise<any> {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE (event_data->>'mappedCount')::int > 0) as mapped,
        COUNT(*) FILTER (WHERE (event_data->>'mappedCount')::int = 0) as unmapped,
        COUNT(*) FILTER (WHERE event_type = 'ROLE_MAPPING_FAILED') as failed
      FROM audit_events
      WHERE event_category = 'authentication'
        AND created_at > now() - $1::interval
        AND event_data ? 'mappedCount'
    `, [interval]);

    const row = result.rows[0];

    return {
      total: parseInt(row.total),
      mapped: parseInt(row.mapped),
      unmapped: parseInt(row.unmapped),
      failed: parseInt(row.failed),
    };
  }

  /**
   * Get active sessions
   */
  private async getActiveSessions(): Promise<any> {
    const [totalResult, byProviderResult, byMethodResult] = await Promise.all([
      this.pool.query(`
        SELECT COUNT(*) as count
        FROM auth_sessions
        WHERE revoked_at IS NULL
          AND expires_at > now()
      `),
      this.pool.query(`
        SELECT provider_id, COUNT(*) as count
        FROM auth_sessions
        WHERE revoked_at IS NULL
          AND expires_at > now()
          AND provider_id IS NOT NULL
        GROUP BY provider_id
      `),
      this.pool.query(`
        SELECT authentication_method, COUNT(*) as count
        FROM auth_sessions
        WHERE revoked_at IS NULL
          AND expires_at > now()
        GROUP BY authentication_method
      `),
    ]);

    const byProvider: Record<string, number> = {};
    for (const row of byProviderResult.rows) {
      byProvider[row.provider_id] = parseInt(row.count);
    }

    const byAuthMethod: Record<string, number> = {};
    for (const row of byMethodResult.rows) {
      byAuthMethod[row.authentication_method] = parseInt(row.count);
    }

    return {
      total: parseInt(totalResult.rows[0].count),
      byProvider,
      byAuthMethod,
    };
  }

  /**
   * Get session metrics
   */
  private async getSessionMetrics(interval: string): Promise<any> {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE created_at > now() - $1::interval) as created,
        COUNT(*) FILTER (WHERE revoked_at > now() - $1::interval AND revoked_at IS NOT NULL) as revoked,
        COUNT(*) FILTER (WHERE expires_at < now() AND expires_at > now() - $1::interval) as expired
      FROM auth_sessions
    `, [interval]);

    const row = result.rows[0];

    // Estimate refreshed (would track this separately in production)
    const refreshedResult = await this.pool.query(`
      SELECT COUNT(*) as count
      FROM auth_sessions
      WHERE last_used_at > created_at + interval '1 minute'
        AND last_used_at > now() - $1::interval
    `, [interval]);

    return {
      created: parseInt(row.created),
      refreshed: parseInt(refreshedResult.rows[0].count),
      revoked: parseInt(row.revoked),
      expired: parseInt(row.expired),
    };
  }

  /**
   * Get error distribution
   */
  private async getErrorDistribution(interval: string): Promise<Record<string, number>> {
    const result = await this.pool.query(`
      SELECT 
        event_data->>'errorCode' as error_code,
        COUNT(*) as count
      FROM audit_events
      WHERE event_type = 'ENTERPRISE_LOGIN_FAILURE'
        AND created_at > now() - $1::interval
        AND event_data ? 'errorCode'
      GROUP BY event_data->>'errorCode'
      ORDER BY COUNT(*) DESC
    `, [interval]);

    const errors: Record<string, number> = {};
    for (const row of result.rows) {
      errors[row.error_code] = parseInt(row.count);
    }

    return errors;
  }

  /**
   * Get provider health summary
   */
  async getProviderHealthSummary(): Promise<Record<string, any>> {
    const result = await this.pool.query(`
      SELECT 
        id,
        configuration->>'name' as name,
        configuration->>'type' as type,
        configuration->>'enabled' as enabled,
        (
          SELECT COUNT(*)
          FROM enterprise_identity_links
          WHERE provider_id = identity_providers.id
        ) as linked_users,
        (
          SELECT COUNT(*)
          FROM auth_sessions
          WHERE provider_id = identity_providers.id
            AND revoked_at IS NULL
            AND expires_at > now()
        ) as active_sessions,
        (
          SELECT COUNT(*)
          FROM audit_events
          WHERE provider_id = identity_providers.id
            AND event_type = 'ENTERPRISE_LOGIN_SUCCESS'
            AND created_at > now() - interval '24 hours'
        ) as logins_24h,
        (
          SELECT MAX(created_at)
          FROM audit_events
          WHERE provider_id = identity_providers.id
            AND event_type = 'ENTERPRISE_LOGIN_SUCCESS'
        ) as last_successful_login
      FROM identity_providers
      ORDER BY (configuration->>'name')
    `);

    const summary: Record<string, any> = {};

    for (const row of result.rows) {
      summary[row.id] = {
        name: row.name,
        type: row.type,
        enabled: row.enabled === 'true',
        linkedUsers: parseInt(row.linked_users),
        activeSessions: parseInt(row.active_sessions),
        logins24h: parseInt(row.logins_24h),
        lastSuccessfulLogin: row.last_successful_login,
      };
    }

    return summary;
  }

  /**
   * Get alerts (conditions that require attention)
   */
  async getAlerts(): Promise<Array<{
    severity: 'critical' | 'warning' | 'info';
    type: string;
    message: string;
    details?: any;
  }>> {
    const alerts: any[] = [];

    // Check authentication failure rate
    const failureRate = await this.pool.query(`
      SELECT 
        provider_id,
        COUNT(*) FILTER (WHERE event_type = 'ENTERPRISE_LOGIN_FAILURE') * 100.0 / 
        NULLIF(COUNT(*), 0) as failure_rate
      FROM audit_events
      WHERE event_type IN ('ENTERPRISE_LOGIN_SUCCESS', 'ENTERPRISE_LOGIN_FAILURE')
        AND created_at > now() - interval '5 minutes'
      GROUP BY provider_id
      HAVING COUNT(*) FILTER (WHERE event_type = 'ENTERPRISE_LOGIN_FAILURE') * 100.0 / 
             NULLIF(COUNT(*), 0) > 10
    `);

    for (const row of failureRate.rows) {
      alerts.push({
        severity: 'critical',
        type: 'HIGH_FAILURE_RATE',
        message: `Provider ${row.provider_id} has ${row.failure_rate.toFixed(1)}% authentication failure rate`,
        details: { providerId: row.provider_id, failureRate: row.failure_rate },
      });
    }

    // Check for providers with no recent activity
    const dormantProviders = await this.pool.query(`
      SELECT 
        id,
        configuration->>'name' as name
      FROM identity_providers
      WHERE configuration->>'enabled' = 'true'
        AND id NOT IN (
          SELECT DISTINCT provider_id
          FROM audit_events
          WHERE event_type = 'ENTERPRISE_LOGIN_SUCCESS'
            AND created_at > now() - interval '7 days'
        )
    `);

    for (const row of dormantProviders.rows) {
      alerts.push({
        severity: 'warning',
        type: 'DORMANT_PROVIDER',
        message: `Provider "${row.name}" has had no successful logins in 7 days`,
        details: { providerId: row.id, name: row.name },
      });
    }

    // Check for high role mapping failures
    const roleMappingFailures = await this.pool.query(`
      SELECT COUNT(*) as count
      FROM audit_events
      WHERE event_data->>'errorCode' = 'NO_ROLE_MAPPING'
        AND created_at > now() - interval '1 hour'
    `);

    const failureCount = parseInt(roleMappingFailures.rows[0].count);
    if (failureCount > 10) {
      alerts.push({
        severity: 'warning',
        type: 'ROLE_MAPPING_FAILURES',
        message: `${failureCount} role mapping failures in the last hour`,
        details: { count: failureCount },
      });
    }

    return alerts;
  }

  /**
   * Convert time range to PostgreSQL interval
   */
  private getInterval(range: MetricTimeRange): string {
    const intervals = {
      '1h': '1 hour',
      '24h': '24 hours',
      '7d': '7 days',
      '30d': '30 days',
    };

    return intervals[range];
  }
}

/**
 * Export metrics in Prometheus format (optional)
 */
export function formatMetricsForPrometheus(metrics: AuthMetrics): string {
  const lines: string[] = [];

  // Authentication success rate
  for (const [providerId, data] of Object.entries(metrics.successRateByProvider)) {
    lines.push(`auth_success_rate{provider="${providerId}"} ${data.successRate}`);
    lines.push(`auth_total{provider="${providerId}"} ${data.total}`);
    lines.push(`auth_successful{provider="${providerId}"} ${data.successful}`);
    lines.push(`auth_failed{provider="${providerId}"} ${data.failed}`);
  }

  // Active sessions
  lines.push(`auth_sessions_active_total ${metrics.activeSessions.total}`);

  for (const [providerId, count] of Object.entries(metrics.activeSessions.byProvider)) {
    lines.push(`auth_sessions_active{provider="${providerId}"} ${count}`);
  }

  for (const [method, count] of Object.entries(metrics.activeSessions.byAuthMethod)) {
    lines.push(`auth_sessions_active{method="${method}"} ${count}`);
  }

  // JIT provisioning
  lines.push(`auth_jit_provisioning_total ${metrics.jitProvisioning.total}`);
  lines.push(`auth_jit_provisioning_created ${metrics.jitProvisioning.created}`);
  lines.push(`auth_jit_provisioning_linked ${metrics.jitProvisioning.linked}`);
  lines.push(`auth_jit_provisioning_failed ${metrics.jitProvisioning.failed}`);

  // Errors
  for (const [errorCode, count] of Object.entries(metrics.errors)) {
    lines.push(`auth_errors{code="${errorCode}"} ${count}`);
  }

  return lines.join('\n');
}
