/**
 * Immutable Storage Service
 * WORM (Write Once Read Many), Legal Hold, and Retention Lock for evidence and recordings
 */

import {
  ImmutableObject,
  ImmutableObjectType,
  RetentionPolicy
} from '../types/security.types';
import crypto from 'crypto';
import fs from 'fs/promises';

export class ImmutableStorageService {
  private objects: Map<string, ImmutableObject> = new Map();
  private lockedObjects: Set<string> = new Set();

  /**
   * Create immutable object
   */
  async createImmutableObject(
    objectType: ImmutableObjectType,
    objectId: string,
    objectPath: string,
    retentionPolicy: RetentionPolicy,
    metadata?: Record<string, any>
  ): Promise<ImmutableObject> {
    console.log(`🔒 Creating immutable object: ${objectType} - ${objectId}`);

    // Calculate checksum
    const data = await fs.readFile(objectPath);
    const checksum = crypto.createHash('sha256').update(data).digest('hex');

    // Calculate lock expiry
    const lockedUntil = new Date();
    lockedUntil.setDate(lockedUntil.getDate() + retentionPolicy.retentionDays);

    const immutableObject: ImmutableObject = {
      id: crypto.randomBytes(16).toString('hex'),
      objectType,
      objectId,
      objectPath,
      retentionPolicy,
      legalHold: false,
      locked: true,
      lockedUntil,
      createdAt: new Date(),
      checksum,
      size: data.length,
      metadata: metadata || {}
    };

    this.objects.set(immutableObject.id, immutableObject);
    this.lockedObjects.add(immutableObject.id);

    console.log(`✓ Immutable object created: ${immutableObject.id} (locked until ${lockedUntil.toISOString()})`);

    return immutableObject;
  }

  /**
   * Apply legal hold
   */
  async applyLegalHold(objectId: string, reason: string): Promise<boolean> {
    const object = this.objects.get(objectId);

    if (!object) {
      return false;
    }

    object.legalHold = true;
    object.legalHoldReason = reason;

    console.log(`⚖️ Legal hold applied: ${objectId} - ${reason}`);

    return true;
  }

  /**
   * Remove legal hold
   */
  async removeLegalHold(objectId: string): Promise<boolean> {
    const object = this.objects.get(objectId);

    if (!object) {
      return false;
    }

    object.legalHold = false;
    object.legalHoldReason = undefined;

    console.log(`✓ Legal hold removed: ${objectId}`);

    return true;
  }

  /**
   * Extend retention period
   */
  async extendRetention(objectId: string, additionalDays: number): Promise<boolean> {
    const object = this.objects.get(objectId);

    if (!object) {
      return false;
    }

    if (!object.retentionPolicy.extendable) {
      console.log(`❌ Cannot extend retention: policy not extendable`);
      return false;
    }

    object.lockedUntil = new Date(object.lockedUntil.getTime() + additionalDays * 24 * 60 * 60 * 1000);
    object.retentionPolicy.retentionDays += additionalDays;

    console.log(`✓ Retention extended: ${objectId} by ${additionalDays} days`);

    return true;
  }

  /**
   * Attempt to delete object (will fail if locked or under legal hold)
   */
  async deleteObject(objectId: string): Promise<{
    success: boolean;
    reason?: string;
  }> {
    const object = this.objects.get(objectId);

    if (!object) {
      return { success: false, reason: 'Object not found' };
    }

    // Check legal hold
    if (object.legalHold) {
      console.log(`❌ Delete blocked: Legal hold active on ${objectId}`);
      return {
        success: false,
        reason: `Legal hold active: ${object.legalHoldReason}`
      };
    }

    // Check retention lock
    const now = new Date();
    if (object.locked && now < object.lockedUntil) {
      console.log(`❌ Delete blocked: Retention lock active until ${object.lockedUntil.toISOString()}`);
      return {
        success: false,
        reason: `Retention locked until ${object.lockedUntil.toISOString()}`
      };
    }

    // Check WORM policy
    if (object.retentionPolicy.wormEnabled) {
      console.log(`❌ Delete blocked: WORM policy enabled`);
      return {
        success: false,
        reason: 'WORM policy prevents deletion'
      };
    }

    // Object can be deleted
    try {
      if (object.retentionPolicy.deleteAfterRetention) {
        await fs.unlink(object.objectPath);
      }

      this.objects.delete(objectId);
      this.lockedObjects.delete(objectId);

      console.log(`✓ Object deleted: ${objectId}`);

      return { success: true };
    } catch (error: any) {
      return { success: false, reason: error.message };
    }
  }

  /**
   * Verify object integrity
   */
  async verifyIntegrity(objectId: string): Promise<{
    valid: boolean;
    currentChecksum?: string;
    expectedChecksum?: string;
  }> {
    const object = this.objects.get(objectId);

    if (!object) {
      return { valid: false };
    }

    try {
      const data = await fs.readFile(object.objectPath);
      const currentChecksum = crypto.createHash('sha256').update(data).digest('hex');

      const valid = currentChecksum === object.checksum;

      if (!valid) {
        console.log(`⚠️ Integrity check failed for ${objectId}`);
      }

      return {
        valid,
        currentChecksum,
        expectedChecksum: object.checksum
      };
    } catch (error) {
      console.error('Integrity verification error:', error);
      return { valid: false };
    }
  }

  /**
   * Get immutable object
   */
  async getObject(objectId: string): Promise<ImmutableObject | null> {
    return this.objects.get(objectId) || null;
  }

  /**
   * List immutable objects
   */
  async listObjects(filter?: {
    objectType?: ImmutableObjectType;
    legalHold?: boolean;
    locked?: boolean;
  }): Promise<ImmutableObject[]> {
    let objects = Array.from(this.objects.values());

    if (filter?.objectType) {
      objects = objects.filter(o => o.objectType === filter.objectType);
    }

    if (filter?.legalHold !== undefined) {
      objects = objects.filter(o => o.legalHold === filter.legalHold);
    }

    if (filter?.locked !== undefined) {
      objects = objects.filter(o => o.locked === filter.locked);
    }

    return objects;
  }

  /**
   * Get storage statistics
   */
  async getStatistics(): Promise<{
    totalObjects: number;
    totalSize: number;
    lockedObjects: number;
    legalHoldObjects: number;
    byType: Record<string, number>;
  }> {
    const objects = Array.from(this.objects.values());

    const byType: Record<string, number> = {};
    for (const type of Object.values(ImmutableObjectType)) {
      byType[type] = objects.filter(o => o.objectType === type).length;
    }

    return {
      totalObjects: objects.length,
      totalSize: objects.reduce((sum, o) => sum + o.size, 0),
      lockedObjects: objects.filter(o => o.locked && new Date() < o.lockedUntil).length,
      legalHoldObjects: objects.filter(o => o.legalHold).length,
      byType
    };
  }

  /**
   * Check for expired retention locks
   */
  async processExpiredLocks(): Promise<{
    processed: number;
    deleted: number;
  }> {
    console.log('🔍 Processing expired retention locks...');

    const now = new Date();
    let processed = 0;
    let deleted = 0;

    for (const [objectId, object] of this.objects.entries()) {
      if (object.locked && now >= object.lockedUntil && !object.legalHold) {
        object.locked = false;
        this.lockedObjects.delete(objectId);
        processed++;

        // Auto-delete if policy allows
        if (object.retentionPolicy.deleteAfterRetention) {
          const result = await this.deleteObject(objectId);
          if (result.success) {
            deleted++;
          }
        }
      }
    }

    console.log(`✓ Processed ${processed} expired locks, deleted ${deleted} objects`);

    return { processed, deleted };
  }
}

export const immutableStorageService = new ImmutableStorageService();
