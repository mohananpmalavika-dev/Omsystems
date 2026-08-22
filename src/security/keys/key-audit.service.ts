/**
 * Key Audit Service
 * 
 * Records cryptographic operations for security audit trail
 * 
 * IMPORTANT: Does NOT log:
 * - Private keys
 * - Plaintext data
 * - Decrypted secrets
 * - PINs or credentials
 * - Full signatures/ciphertexts (only metadata)
 * 
 * DOES log:
 * - Operation type
 * - Key ID and version
 * - Provider used
 * - Success/failure
 * - Duration
 * - Context (tenant, service, actor)
 */

import { getDatabase } from '../../config/database.js';
import {
  KeyAuditRecord,
  KeyOperation,
  KeyProviderErrorCode,
  KeyProviderSecurityLevel
} from './types.js';

export class KeyAuditService {
  private readonly collectionName = 'key_audit_log';

  /**
   * Record cryptographic operation
   */
  async recordOperation(record: Omit<KeyAuditRecord, 'id' | 'timestamp'>): Promise<void> {
    const db = getDatabase();
    
    const auditRecord: KeyAuditRecord = {
      id: this.generateAuditId(),
      timestamp: new Date(),
      ...record
    };
    
    await db.collection(this.collectionName).insertOne(auditRecord);
    
    // Log critical failures to console as well
    if (!record.success && this.isCriticalFailure(record.errorCode)) {
      console.error(
        `[KeyAudit] CRITICAL FAILURE: ${record.operation} on key ${record.keyId} - ${record.errorCode}`
      );
    }
  }

  /**
   * Get audit records for a key
   */
  async getKeyAuditLog(
    keyId: string,
    options?: {
      limit?: number;
      operation?: KeyOperation;
      successOnly?: boolean;
      failuresOnly?: boolean;
      since?: Date;
    }
  ): Promise<KeyAuditRecord[]> {
    const db = getDatabase();
    
    const query: any = { keyId };
    
    if (options?.operation) {
      query.operation = options.operation;
    }
    
    if (options?.successOnly) {
      query.success = true;
    } else if (options?.failuresOnly) {
      query.success = false;
    }
    
    if (options?.since) {
      query.timestamp = { $gte: options.since };
    }
    
    const records = await db.collection(this.collectionName)
      .find(query)
      .sort({ timestamp: -1 })
      .limit(options?.limit ?? 100)
      .toArray();
    
    return records as KeyAuditRecord[];
  }

  /**
   * Get audit records by tenant
   */
  async getTenantAuditLog(
    tenantId: string,
    options?: { limit?: number; since?: Date }
  ): Promise<KeyAuditRecord[]> {
    const db = getDatabase();
    
    const query: any = { tenantId };
    
    if (options?.since) {
      query.timestamp = { $gte: options.since };
    }
    
    const records = await db.collection(this.collectionName)
      .find(query)
      .sort({ timestamp: -1 })
      .limit(options?.limit ?? 100)
      .toArray();
    
    return records as KeyAuditRecord[];
  }

  /**
   * Get recent failures
   */
  async getRecentFailures(
    options?: { limit?: number; since?: Date }
  ): Promise<KeyAuditRecord[]> {
    const db = getDatabase();
    
    const query: any = { success: false };
    
    if (options?.since) {
      query.timestamp = { $gte: options.since };
    }
    
    const records = await db.collection(this.collectionName)
      .find(query)
      .sort({ timestamp: -1 })
      .limit(options?.limit ?? 50)
      .toArray();
    
    return records as KeyAuditRecord[];
  }

  /**
   * Get operation statistics
   */
  async getOperationStatistics(
    options?: { since?: Date; keyId?: string }
  ): Promise<{
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    operationsByType: Record<string, number>;
    failuresByError: Record<string, number>;
    averageDurationMs: number;
  }> {
    const db = getDatabase();
    
    const matchQuery: any = options?.since
      ? { timestamp: { $gte: options.since } }
      : {};
    
    if (options?.keyId) {
      matchQuery.keyId = options.keyId;
    }
    
    const stats = await db.collection(this.collectionName).aggregate([
      { $match: matchQuery },
      {
        $facet: {
          total: [{ $count: 'count' }],
          successful: [{ $match: { success: true } }, { $count: 'count' }],
          failed: [{ $match: { success: false } }, { $count: 'count' }],
          byOperation: [
            { $group: { _id: '$operation', count: { $sum: 1 } } }
          ],
          byError: [
            { $match: { success: false } },
            { $group: { _id: '$errorCode', count: { $sum: 1 } } }
          ],
          avgDuration: [
            { $group: { _id: null, avg: { $avg: '$durationMs' } } }
          ]
        }
      }
    ]).toArray();
    
    const result = stats[0];
    
    const operationsByType: Record<string, number> = {};
    for (const item of result.byOperation || []) {
      operationsByType[item._id] = item.count;
    }
    
    const failuresByError: Record<string, number> = {};
    for (const item of result.byError || []) {
      failuresByError[item._id] = item.count;
    }
    
    return {
      totalOperations: result.total[0]?.count ?? 0,
      successfulOperations: result.successful[0]?.count ?? 0,
      failedOperations: result.failed[0]?.count ?? 0,
      operationsByType,
      failuresByError,
      averageDurationMs: result.avgDuration[0]?.avg ?? 0
    };
  }

  /**
   * Get security anomalies
   * Identifies suspicious patterns like:
   * - Repeated failures on same key
   * - Unauthorized access attempts
   * - Unusual operation patterns
   */
  async getSecurityAnomalies(options?: {
    since?: Date;
    failureThreshold?: number;
  }): Promise<{
    keysWithHighFailureRate: Array<{ keyId: string; failureCount: number }>;
    unauthorizedAttempts: number;
    suspiciousPatterns: string[];
  }> {
    const db = getDatabase();
    const since = options?.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
    const failureThreshold = options?.failureThreshold ?? 10;
    
    // Keys with high failure rates
    const failuresByKey = await db.collection(this.collectionName).aggregate([
      { $match: { timestamp: { $gte: since }, success: false } },
      { $group: { _id: '$keyId', failureCount: { $sum: 1 } } },
      { $match: { failureCount: { $gte: failureThreshold } } },
      { $sort: { failureCount: -1 } }
    ]).toArray();
    
    // Unauthorized access attempts
    const unauthorizedCount = await db.collection(this.collectionName).countDocuments({
      timestamp: { $gte: since },
      success: false,
      errorCode: { $in: ['PERMISSION_DENIED', 'AUTHENTICATION_FAILED'] }
    });
    
    const suspiciousPatterns: string[] = [];
    
    // Pattern: Many failures followed by success (brute force?)
    const suspiciousSequences = await db.collection(this.collectionName).aggregate([
      { $match: { timestamp: { $gte: since } } },
      { $sort: { keyId: 1, timestamp: 1 } },
      {
        $group: {
          _id: '$keyId',
          operations: {
            $push: { success: '$success', timestamp: '$timestamp' }
          }
        }
      }
    ]).toArray();
    
    for (const seq of suspiciousSequences) {
      const ops = seq.operations as Array<{ success: boolean; timestamp: Date }>;
      let consecutiveFailures = 0;
      
      for (const op of ops) {
        if (!op.success) {
          consecutiveFailures++;
        } else {
          if (consecutiveFailures >= 5) {
            suspiciousPatterns.push(
              `Key ${seq._id}: ${consecutiveFailures} failures before success`
            );
          }
          consecutiveFailures = 0;
        }
      }
    }
    
    return {
      keysWithHighFailureRate: failuresByKey.map((f: any) => ({
        keyId: f._id,
        failureCount: f.failureCount
      })),
      unauthorizedAttempts: unauthorizedCount,
      suspiciousPatterns
    };
  }

  /**
   * Initialize audit service (create indexes)
   */
  async initialize(): Promise<void> {
    const db = getDatabase();
    const collection = db.collection(this.collectionName);
    
    // Create indexes for efficient queries
    await collection.createIndex({ keyId: 1, timestamp: -1 });
    await collection.createIndex({ tenantId: 1, timestamp: -1 });
    await collection.createIndex({ timestamp: -1 });
    await collection.createIndex({ success: 1, timestamp: -1 });
    await collection.createIndex({ operation: 1, timestamp: -1 });
    await collection.createIndex({ errorCode: 1 }, { sparse: true });
    
    // TTL index for automatic cleanup (retain 1 year)
    await collection.createIndex(
      { timestamp: 1 },
      { expireAfterSeconds: 365 * 24 * 60 * 60 }
    );
    
    console.log('[KeyAudit] ✓ Initialized with database indexes');
  }

  /**
   * Purge old audit records
   */
  async purgeOldRecords(olderThan: Date): Promise<number> {
    const db = getDatabase();
    
    const result = await db.collection(this.collectionName).deleteMany({
      timestamp: { $lt: olderThan }
    });
    
    console.log(`[KeyAudit] Purged ${result.deletedCount} old audit records`);
    
    return result.deletedCount;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private generateAuditId(): string {
    return `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private isCriticalFailure(errorCode?: KeyProviderErrorCode): boolean {
    if (!errorCode) return false;
    
    const criticalErrors: KeyProviderErrorCode[] = [
      'AUTHENTICATION_FAILED',
      'DEVICE_ERROR',
      'PRODUCTION_SAFETY_VIOLATION',
      'KEY_POLICY_VIOLATION'
    ];
    
    return criticalErrors.includes(errorCode);
  }
}
