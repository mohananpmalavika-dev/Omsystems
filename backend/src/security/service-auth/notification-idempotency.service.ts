/**
 * Notification Idempotency Service
 * 
 * Prevents duplicate notification delivery via idempotency keys.
 * Database-backed with unique constraint enforcement.
 */

import { createHash } from 'crypto';
import { Pool, PoolClient } from 'pg';
import {
  ServiceId,
  IdempotencyCheckResult,
  IdempotencyRecord,
  INotificationIdempotencyService,
  IdempotencyConflictError,
} from './service-auth.types.js';
import { logger } from '../../utils/logger.js';

export class NotificationIdempotencyService implements INotificationIdempotencyService {
  constructor(private readonly pool: Pool) {}

  /**
   * Check idempotency and return existing notification if duplicate
   * 
   * Returns:
   * - isDuplicate: false -> proceed with notification creation
   * - isDuplicate: true, isConflict: false -> return existing notification
   * - isConflict: true -> throw IdempotencyConflictError
   */
  async check(
    tenantId: string,
    serviceId: ServiceId,
    idempotencyKey: string,
    requestHash: string
  ): Promise<IdempotencyCheckResult> {
    const query = `
      SELECT
        id,
        tenant_id,
        caller_service,
        idempotency_key,
        request_hash,
        notification_id,
        created_at,
        expires_at
      FROM service_notification_idempotency
      WHERE tenant_id = $1
        AND caller_service = $2
        AND idempotency_key = $3
        AND expires_at > NOW()
    `;

    try {
      const result = await this.pool.query(query, [tenantId, serviceId, idempotencyKey]);

      if (result.rows.length === 0) {
        // No existing record - not a duplicate
        return {
          isDuplicate: false,
          isConflict: false,
        };
      }

      const existing = result.rows[0];

      // Check if request hash matches
      if (existing.request_hash !== requestHash) {
        // Same idempotency key, different request - conflict
        logger.warn('Idempotency conflict detected', {
          tenantId,
          serviceId,
          idempotencyKey,
          existingHash: existing.request_hash,
          requestHash,
        });

        return {
          isDuplicate: true,
          isConflict: true,
        };
      }

      // Same request - return existing notification
      logger.info('Duplicate notification request detected', {
        tenantId,
        serviceId,
        idempotencyKey,
        notificationId: existing.notification_id,
        originalCreatedAt: existing.created_at,
      });

      return {
        isDuplicate: true,
        notificationId: existing.notification_id,
        isConflict: false,
      };
    } catch (error) {
      logger.error('Error checking idempotency', {
        error,
        tenantId,
        serviceId,
        idempotencyKey,
      });
      throw error;
    }
  }

  /**
   * Record idempotency after successful notification creation
   * 
   * This should be called within the same transaction as notification creation
   * to ensure atomicity.
   */
  async record(
    tenantId: string,
    serviceId: ServiceId,
    idempotencyKey: string,
    requestHash: string,
    notificationId: string,
    ttlSeconds: number,
    tx?: PoolClient
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const query = `
      INSERT INTO service_notification_idempotency (
        tenant_id,
        caller_service,
        idempotency_key,
        request_hash,
        notification_id,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (tenant_id, caller_service, idempotency_key)
      DO NOTHING
    `;

    const client = tx || this.pool;

    try {
      await client.query(query, [
        tenantId,
        serviceId,
        idempotencyKey,
        requestHash,
        notificationId,
        expiresAt,
      ]);

      logger.debug('Idempotency record created', {
        tenantId,
        serviceId,
        idempotencyKey,
        notificationId,
        expiresAt,
      });
    } catch (error) {
      logger.error('Error recording idempotency', {
        error,
        tenantId,
        serviceId,
        idempotencyKey,
        notificationId,
      });
      throw error;
    }
  }

  /**
   * Find idempotency record
   */
  async findRecord(
    tenantId: string,
    serviceId: ServiceId,
    idempotencyKey: string
  ): Promise<IdempotencyRecord | null> {
    const query = `
      SELECT
        id,
        tenant_id,
        caller_service,
        idempotency_key,
        request_hash,
        notification_id,
        created_at,
        expires_at
      FROM service_notification_idempotency
      WHERE tenant_id = $1
        AND caller_service = $2
        AND idempotency_key = $3
        AND expires_at > NOW()
    `;

    try {
      const result = await this.pool.query(query, [tenantId, serviceId, idempotencyKey]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      return {
        id: row.id,
        tenantId: row.tenant_id,
        callerService: row.caller_service,
        idempotencyKey: row.idempotency_key,
        requestHash: row.request_hash,
        notificationId: row.notification_id,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      };
    } catch (error) {
      logger.error('Error finding idempotency record', {
        error,
        tenantId,
        serviceId,
        idempotencyKey,
      });
      throw error;
    }
  }

  /**
   * Clean up expired idempotency records
   * Should be called periodically by background job
   */
  async cleanupExpired(): Promise<number> {
    const query = `
      DELETE FROM service_notification_idempotency
      WHERE expires_at < NOW()
    `;

    try {
      const result = await this.pool.query(query);
      const deletedCount = result.rowCount || 0;

      if (deletedCount > 0) {
        logger.info('Cleaned up expired idempotency records', {
          deletedCount,
        });
      }

      return deletedCount;
    } catch (error) {
      logger.error('Error cleaning up expired idempotency records', { error });
      throw error;
    }
  }

  /**
   * Get idempotency statistics
   */
  async getStats(): Promise<{
    totalRecords: number;
    expiredRecords: number;
    recordsByService: Record<ServiceId, number>;
  }> {
    const statsQuery = `
      SELECT
        COUNT(*) as total_records,
        COUNT(*) FILTER (WHERE expires_at < NOW()) as expired_records
      FROM service_notification_idempotency
    `;

    const byServiceQuery = `
      SELECT
        caller_service,
        COUNT(*) as count
      FROM service_notification_idempotency
      WHERE expires_at > NOW()
      GROUP BY caller_service
    `;

    try {
      const [statsResult, byServiceResult] = await Promise.all([
        this.pool.query(statsQuery),
        this.pool.query(byServiceQuery),
      ]);

      const stats = statsResult.rows[0];
      const recordsByService: Record<string, number> = {};

      for (const row of byServiceResult.rows) {
        recordsByService[row.caller_service] = parseInt(row.count, 10);
      }

      return {
        totalRecords: parseInt(stats.total_records, 10),
        expiredRecords: parseInt(stats.expired_records, 10),
        recordsByService: recordsByService as Record<ServiceId, number>,
      };
    } catch (error) {
      logger.error('Error getting idempotency stats', { error });
      throw error;
    }
  }
}

/**
 * Compute request hash for idempotency comparison
 * 
 * Hash includes all semantically significant fields that would affect
 * notification behavior. Order-independent for arrays.
 */
export function computeRequestHash(request: {
  tenantId: string;
  purpose: string;
  eventId: string;
  templateId: string;
  recipientRefs: string[];
  data: Record<string, unknown>;
}): string {
  // Normalize data for consistent hashing
  const normalized = {
    tenantId: request.tenantId,
    purpose: request.purpose,
    eventId: request.eventId,
    templateId: request.templateId,
    recipientRefs: [...request.recipientRefs].sort(), // Sort for order-independence
    data: JSON.stringify(request.data, Object.keys(request.data).sort()), // Sort keys
  };

  const hash = createHash('sha256');
  hash.update(JSON.stringify(normalized));

  return hash.digest('hex');
}

/**
 * Factory function for creating NotificationIdempotencyService
 */
export function createNotificationIdempotencyService(pool: Pool): NotificationIdempotencyService {
  return new NotificationIdempotencyService(pool);
}
