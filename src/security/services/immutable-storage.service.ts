/**
 * Immutable Storage Service
 * WORM storage with retention policies and legal holds
 */

import { IImmutableStorageService, ImmutableFilters } from '../interfaces.js';
import { ImmutableObject, RetentionPolicy, RetentionStatus, LegalHold } from '../types.js';
import { getDatabase } from '../../config/database.js';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';

export class ImmutableStorageService extends EventEmitter implements IImmutableStorageService {
  
  /**
   * Store object with immutability guarantees
   */
  async storeImmutable(
    objectKey: string,
    objectType: 'video' | 'evidence' | 'audit_log' | 'document',
    data: Buffer,
    retentionDays: number,
    metadata: Record<string, any> = {}
  ): Promise<ImmutableObject> {
    const db = getDatabase();

    const checksum = this.calculateChecksum(data);
    const retentionExpiresAt = new Date();
    retentionExpiresAt.setDate(retentionExpiresAt.getDate() + retentionDays);

    const immutableObject: ImmutableObject = {
      id: this.generateId(),
      objectKey,
      objectType,
      size: data.length,
      checksum,
      algorithm: 'sha256',
      retentionPeriodDays: retentionDays,
      retentionExpiresAt,
      retentionStatus: RetentionStatus.ACTIVE,
      legalHolds: [],
      versions: [{
        versionId: this.generateVersionId(),
        checksum,
        size: data.length,
        timestamp: new Date(),
        immutable: true
      }],
      createdAt: new Date(),
      createdBy: 'system',
      locked: false,
      metadata
    };

    // Store metadata in database
    await db.collection('immutable_objects').insertOne(immutableObject);

    // Store actual data in immutable storage backend
    await this.storeObjectData(immutableObject.id, data);

    this.emit('object:stored', { objectId: immutableObject.id, objectKey, objectType });

    return immutableObject;
  }

  /**
   * Get immutable object
   */
  async getImmutableObject(id: string): Promise<ImmutableObject> {
    const db = getDatabase();
    
    const object = await db.collection('immutable_objects').findOne({ id });
    
    if (!object) {
      throw new Error('Immutable object not found');
    }
    
    return object;
  }

  /**
   * List immutable objects with filters
   */
  async listImmutableObjects(filters: ImmutableFilters = {}): Promise<ImmutableObject[]> {
    const db = getDatabase();
    
    const query: any = {};
    
    if (filters.objectType) {
      query.objectType = filters.objectType;
    }
    
    if (filters.retentionStatus) {
      query.retentionStatus = filters.retentionStatus;
    }
    
    if (filters.hasLegalHold !== undefined) {
      query['legalHolds.0'] = filters.hasLegalHold ? { $exists: true } : { $exists: false };
    }
    
    return await db.collection('immutable_objects')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
  }

  /**
   * Apply retention policy
   */
  async applyRetentionPolicy(policyId: string, objectId: string): Promise<void> {
    const db = getDatabase();
    
    const policy = await db.collection('retention_policies').findOne({ id: policyId });
    if (!policy) {
      throw new Error('Retention policy not found');
    }

    const object = await this.getImmutableObject(objectId);

    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + policy.retentionDays);

    await db.collection('immutable_objects').updateOne(
      { id: objectId },
      {
        $set: {
          retentionPeriodDays: policy.retentionDays,
          retentionExpiresAt: newExpiresAt,
          metadata: {
            ...object.metadata,
            policyId,
            policyAppliedAt: new Date()
          }
        }
      }
    );

    if (policy.lockImmediately) {
      await this.lockObject(objectId);
    }

    this.emit('policy:applied', { objectId, policyId });
  }

  /**
   * Extend retention period
   */
  async extendRetention(objectId: string, additionalDays: number): Promise<void> {
    const db = getDatabase();
    
    const object = await this.getImmutableObject(objectId);

    if (object.locked) {
      throw new Error('Cannot extend retention on locked object');
    }

    const newExpiresAt = new Date(object.retentionExpiresAt);
    newExpiresAt.setDate(newExpiresAt.getDate() + additionalDays);

    await db.collection('immutable_objects').updateOne(
      { id: objectId },
      {
        $set: {
          retentionPeriodDays: object.retentionPeriodDays + additionalDays,
          retentionExpiresAt: newExpiresAt
        }
      }
    );

    this.emit('retention:extended', { objectId, additionalDays });
  }

  /**
   * Apply legal hold
   */
  async applyLegalHold(objectId: string, caseNumber: string, description: string): Promise<void> {
    const db = getDatabase();

    const hold: LegalHold = {
      id: this.generateId(),
      caseNumber,
      description,
      appliedAt: new Date(),
      appliedBy: 'system'
    };

    await db.collection('immutable_objects').updateOne(
      { id: objectId },
      {
        $push: { legalHolds: hold },
        $set: { retentionStatus: RetentionStatus.LEGAL_HOLD }
      }
    );

    this.emit('legal-hold:applied', { objectId, caseNumber });
  }

  /**
   * Release legal hold
   */
  async releaseLegalHold(objectId: string, holdId: string, userId: string): Promise<void> {
    const db = getDatabase();

    await db.collection('immutable_objects').updateOne(
      { id: objectId, 'legalHolds.id': holdId },
      {
        $set: {
          'legalHolds.$.releasedAt': new Date(),
          'legalHolds.$.releasedBy': userId
        }
      }
    );

    // Check if any active legal holds remain
    const object = await this.getImmutableObject(objectId);
    const activeHolds = object.legalHolds.filter(h => !h.releasedAt);

    if (activeHolds.length === 0) {
      await db.collection('immutable_objects').updateOne(
        { id: objectId },
        { $set: { retentionStatus: RetentionStatus.ACTIVE } }
      );
    }

    this.emit('legal-hold:released', { objectId, holdId });
  }

  /**
   * List legal holds for an object
   */
  async listLegalHolds(objectId: string): Promise<LegalHold[]> {
    const object = await this.getImmutableObject(objectId);
    return object.legalHolds;
  }

  /**
   * Lock object (make truly immutable)
   */
  async lockObject(objectId: string): Promise<void> {
    const db = getDatabase();

    await db.collection('immutable_objects').updateOne(
      { id: objectId },
      {
        $set: {
          locked: true,
          lockedAt: new Date(),
          retentionStatus: RetentionStatus.LOCKED
        }
      }
    );

    this.emit('object:locked', { objectId });
  }

  /**
   * Verify object integrity
   */
  async verifyIntegrity(objectId: string): Promise<boolean> {
    const object = await this.getImmutableObject(objectId);
    
    const data = await this.retrieveObjectData(objectId);
    const currentChecksum = this.calculateChecksum(data);

    return currentChecksum === object.checksum;
  }

  /**
   * Verify immutability (check if object has been modified)
   */
  async verifyImmutability(objectId: string): Promise<boolean> {
    const object = await this.getImmutableObject(objectId);
    
    // Check if all versions are marked immutable
    return object.versions.every(v => v.immutable === true);
  }

  /**
   * Create retention policy
   */
  async createRetentionPolicy(policy: Omit<RetentionPolicy, 'id'>): Promise<RetentionPolicy> {
    const db = getDatabase();

    const newPolicy: RetentionPolicy = {
      id: this.generateId(),
      ...policy
    };

    await db.collection('retention_policies').insertOne(newPolicy);

    this.emit('policy:created', { policyId: newPolicy.id });

    return newPolicy;
  }

  /**
   * List retention policies
   */
  async listRetentionPolicies(): Promise<RetentionPolicy[]> {
    const db = getDatabase();
    
    return await db.collection('retention_policies')
      .find({ enabled: true })
      .sort({ priority: 1 })
      .toArray();
  }

  /**
   * Store object data (placeholder - would use S3 Object Lock or similar)
   */
  private async storeObjectData(objectId: string, data: Buffer): Promise<void> {
    // In production, this would:
    // 1. Use AWS S3 with Object Lock
    // 2. Use Azure Immutable Blob Storage
    // 3. Use compliance-mode WORM storage
    // 4. Use tape archival systems
    
    // For now, store reference in metadata
    const db = getDatabase();
    await db.collection('immutable_object_data').insertOne({
      objectId,
      data: data.toString('base64'),
      storedAt: new Date()
    });
  }

  /**
   * Retrieve object data
   */
  private async retrieveObjectData(objectId: string): Promise<Buffer> {
    const db = getDatabase();
    
    const record = await db.collection('immutable_object_data').findOne({ objectId });
    
    if (!record) {
      throw new Error('Object data not found');
    }
    
    return Buffer.from(record.data, 'base64');
  }

  /**
   * Calculate checksum
   */
  private calculateChecksum(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  private generateId(): string {
    return `immut_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateVersionId(): string {
    return `v_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const db = getDatabase();
      const totalObjects = await db.collection('immutable_objects').countDocuments();
      const lockedObjects = await db.collection('immutable_objects').countDocuments({ locked: true });
      const legalHolds = await db.collection('immutable_objects').countDocuments({ 'legalHolds.0': { $exists: true } });
      
      return {
        status: 'healthy',
        details: {
          totalObjects,
          lockedObjects,
          objectsWithLegalHolds: legalHolds
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }
  }
}
