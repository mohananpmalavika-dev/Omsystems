/**
 * MFA Security Event Repository
 * 
 * Persistent audit logging for MFA security events.
 * Records rate limits, lockouts, verification attempts, and other security-relevant actions.
 * 
 * USAGE:
 * - Forensic investigation
 * - Fraud detection
 * - Compliance evidence
 * - SIEM forwarding
 * - Adaptive authentication
 * - Security dashboards
 */

import { Pool, PoolClient } from 'pg';
import { logger } from '../../../utils/logger.js';
import {
  MfaSecurityEvent,
  MfaSecurityEventType,
} from '../abuse/mfa-rate-limit.types.js';

export interface CreateSecurityEventParams {
  tenantId: string;
  userId?: string;
  challengeId?: string;
  
  type: MfaSecurityEventType;
  method: 'SMS' | 'EMAIL' | 'TOTP';
  
  /** HMAC-hashed identifiers (not raw PII) */
  ipHash?: string;
  deviceHash?: string;
  destinationHash?: string;
  
  attempts?: number;
  limit?: number;
  reason?: string;
  
  metadata?: Record<string, any>;
}

export interface SecurityEventFilters {
  tenantId?: string;
  userId?: string;
  challengeId?: string;
  type?: MfaSecurityEventType;
  method?: 'SMS' | 'EMAIL' | 'TOTP';
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export class MfaSecurityEventRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Create security event
   */
  async create(
    params: CreateSecurityEventParams,
    client?: PoolClient
  ): Promise<MfaSecurityEvent> {
    const db = client || this.pool;

    try {
      const result = await db.query(
        `INSERT INTO mfa_security_events (
          tenant_id, user_id, challenge_id,
          type, method,
          ip_hash, device_hash, destination_hash,
          attempts, limit, reason,
          metadata
        ) VALUES (
          $1, $2, $3,
          $4, $5,
          $6, $7, $8,
          $9, $10, $11,
          $12
        ) RETURNING *`,
        [
          params.tenantId,
          params.userId,
          params.challengeId,
          params.type,
          params.method,
          params.ipHash,
          params.deviceHash,
          params.destinationHash,
          params.attempts,
          params.limit,
          params.reason,
          JSON.stringify(params.metadata || {}),
        ]
      );

      return this.mapRow(result.rows[0]);
    } catch (error) {
      logger.error('Failed to create MFA security event', {
        type: params.type,
        tenantId: params.tenantId,
        error,
      });
      throw error;
    }
  }

  /**
   * Find events by filters
   */
  async findByFilters(filters: SecurityEventFilters): Promise<MfaSecurityEvent[]> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (filters.tenantId) {
      conditions.push(`tenant_id = $${paramIndex++}`);
      values.push(filters.tenantId);
    }

    if (filters.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      values.push(filters.userId);
    }

    if (filters.challengeId) {
      conditions.push(`challenge_id = $${paramIndex++}`);
      values.push(filters.challengeId);
    }

    if (filters.type) {
      conditions.push(`type = $${paramIndex++}`);
      values.push(filters.type);
    }

    if (filters.method) {
      conditions.push(`method = $${paramIndex++}`);
      values.push(filters.method);
    }

    if (filters.fromDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(filters.fromDate);
    }

    if (filters.toDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(filters.toDate);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    const query = `
      SELECT * FROM mfa_security_events
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    values.push(limit, offset);

    const result = await this.pool.query(query, values);
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find recent events for user
   */
  async findRecentForUser(
    tenantId: string,
    userId: string,
    limit: number = 50
  ): Promise<MfaSecurityEvent[]> {
    return this.findByFilters({
      tenantId,
      userId,
      limit,
    });
  }

  /**
   * Count events by type for user
   */
  async countByTypeForUser(
    tenantId: string,
    userId: string,
    type: MfaSecurityEventType,
    fromDate: Date
  ): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count
       FROM mfa_security_events
       WHERE tenant_id = $1
         AND user_id = $2
         AND type = $3
         AND created_at >= $4`,
      [tenantId, userId, type, fromDate]
    );

    return parseInt(result.rows[0]?.count || '0', 10);
  }

  /**
   * Get verification failure count for user in time window
   */
  async getVerificationFailureCount(
    tenantId: string,
    userId: string,
    windowMinutes: number = 30
  ): Promise<number> {
    const fromDate = new Date(Date.now() - windowMinutes * 60 * 1000);

    return this.countByTypeForUser(
      tenantId,
      userId,
      'MFA_VERIFICATION_FAILED',
      fromDate
    );
  }

  /**
   * Get rate limit events for user in time window
   */
  async getRateLimitEvents(
    tenantId: string,
    userId: string,
    windowMinutes: number = 60
  ): Promise<MfaSecurityEvent[]> {
    const fromDate = new Date(Date.now() - windowMinutes * 60 * 1000);

    const result = await this.pool.query(
      `SELECT * FROM mfa_security_events
       WHERE tenant_id = $1
         AND user_id = $2
         AND type IN (
           'MFA_GENERATION_RATE_LIMITED',
           'MFA_VERIFICATION_RATE_LIMITED',
           'MFA_USER_TEMPORARILY_LOCKED'
         )
         AND created_at >= $3
       ORDER BY created_at DESC`,
      [tenantId, userId, fromDate]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find suspicious patterns (for fraud detection)
   */
  async findSuspiciousPatterns(
    tenantId: string,
    lookbackHours: number = 24
  ): Promise<Array<{
    userId: string;
    failureCount: number;
    rateLimitCount: number;
    lastFailure: Date;
  }>> {
    const fromDate = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

    const result = await this.pool.query(
      `SELECT
         user_id,
         COUNT(CASE WHEN type = 'MFA_VERIFICATION_FAILED' THEN 1 END) as failure_count,
         COUNT(CASE WHEN type IN ('MFA_GENERATION_RATE_LIMITED', 'MFA_VERIFICATION_RATE_LIMITED') THEN 1 END) as rate_limit_count,
         MAX(created_at) as last_failure
       FROM mfa_security_events
       WHERE tenant_id = $1
         AND created_at >= $2
         AND user_id IS NOT NULL
       GROUP BY user_id
       HAVING COUNT(CASE WHEN type = 'MFA_VERIFICATION_FAILED' THEN 1 END) >= 5
       ORDER BY failure_count DESC
       LIMIT 100`,
      [tenantId, fromDate]
    );

    return result.rows.map(row => ({
      userId: row.user_id,
      failureCount: parseInt(row.failure_count, 10),
      rateLimitCount: parseInt(row.rate_limit_count, 10),
      lastFailure: new Date(row.last_failure),
    }));
  }

  /**
   * Get event statistics for dashboard
   */
  async getStatistics(
    tenantId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<{
    totalEvents: number;
    generationAttempts: number;
    generationRateLimited: number;
    verificationAttempts: number;
    verificationSucceeded: number;
    verificationFailed: number;
    verificationRateLimited: number;
    challengesLocked: number;
    usersLocked: number;
  }> {
    const result = await this.pool.query(
      `SELECT
         COUNT(*) as total_events,
         COUNT(CASE WHEN type = 'MFA_GENERATION_REQUESTED' THEN 1 END) as generation_attempts,
         COUNT(CASE WHEN type = 'MFA_GENERATION_RATE_LIMITED' THEN 1 END) as generation_rate_limited,
         COUNT(CASE WHEN type = 'MFA_VERIFICATION_REQUESTED' THEN 1 END) as verification_attempts,
         COUNT(CASE WHEN type = 'MFA_VERIFICATION_SUCCEEDED' THEN 1 END) as verification_succeeded,
         COUNT(CASE WHEN type = 'MFA_VERIFICATION_FAILED' THEN 1 END) as verification_failed,
         COUNT(CASE WHEN type = 'MFA_VERIFICATION_RATE_LIMITED' THEN 1 END) as verification_rate_limited,
         COUNT(CASE WHEN type = 'MFA_CHALLENGE_LOCKED' THEN 1 END) as challenges_locked,
         COUNT(CASE WHEN type = 'MFA_USER_TEMPORARILY_LOCKED' THEN 1 END) as users_locked
       FROM mfa_security_events
       WHERE tenant_id = $1
         AND created_at >= $2
         AND created_at <= $3`,
      [tenantId, fromDate, toDate]
    );

    const row = result.rows[0];

    return {
      totalEvents: parseInt(row.total_events, 10),
      generationAttempts: parseInt(row.generation_attempts, 10),
      generationRateLimited: parseInt(row.generation_rate_limited, 10),
      verificationAttempts: parseInt(row.verification_attempts, 10),
      verificationSucceeded: parseInt(row.verification_succeeded, 10),
      verificationFailed: parseInt(row.verification_failed, 10),
      verificationRateLimited: parseInt(row.verification_rate_limited, 10),
      challengesLocked: parseInt(row.challenges_locked, 10),
      usersLocked: parseInt(row.users_locked, 10),
    };
  }

  /**
   * Delete old events (cleanup job)
   */
  async deleteOldEvents(daysOld: number = 90): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM mfa_security_events
       WHERE created_at < NOW() - INTERVAL '${daysOld} days'`,
    );

    const deletedCount = result.rowCount || 0;

    if (deletedCount > 0) {
      logger.info('Deleted old MFA security events', { count: deletedCount });
    }

    return deletedCount;
  }

  /**
   * Map database row to MfaSecurityEvent
   */
  private mapRow(row: any): MfaSecurityEvent {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      challengeId: row.challenge_id,
      type: row.type,
      method: row.method,
      ipHash: row.ip_hash,
      deviceHash: row.device_hash,
      destinationHash: row.destination_hash,
      attempts: row.attempts,
      limit: row.limit,
      reason: row.reason,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at),
    };
  }
}
