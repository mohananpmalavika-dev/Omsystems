/**
 * Key Registry Service
 * 
 * Manages key metadata WITHOUT storing private key material
 * Provides key lifecycle management, versioning, and rotation tracking
 * 
 * Database schema stores:
 * - Key metadata (ID, purpose, algorithm, version, status)
 * - Provider information (which HSM/KMS owns the key)
 * - Policy and lifecycle data
 * - Rotation schedules
 * 
 * Database does NOT store:
 * - Private keys
 * - Secret key material
 * - PINs or credentials
 */

import { getDatabase } from '../../config/database.js';
import {
  KeyMetadata,
  KeyReference,
  KeyPurpose,
  KeyStatus,
  KeyPolicy,
  KeyRotationSchedule
} from './types.js';
import { KeyNotFoundError } from './errors.js';

export class KeyRegistryService {
  private readonly collectionName = 'cryptographic_keys';

  /**
   * Register new key metadata
   */
  async registerKey(metadata: KeyMetadata): Promise<void> {
    const db = getDatabase();
    
    await db.collection(this.collectionName).insertOne({
      ...metadata,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    console.log(`[KeyRegistry] Registered key: ${metadata.id} (${metadata.purpose})`);
  }

  /**
   * Get key metadata by ID
   */
  async getKey(id: string, version?: number): Promise<KeyMetadata> {
    const db = getDatabase();
    
    const query: any = { id };
    if (version !== undefined) {
      query.version = version;
    }
    
    const key = await db.collection(this.collectionName)
      .findOne(query, { sort: { version: -1 } });
    
    if (!key) {
      throw new KeyNotFoundError(
        'registry',
        id,
        version ? `Key ${id} version ${version} not found` : `Key ${id} not found`
      );
    }
    
    return key as KeyMetadata;
  }

  /**
   * Get active version of key
   */
  async getActiveKey(id: string): Promise<KeyMetadata> {
    const db = getDatabase();
    
    const key = await db.collection(this.collectionName).findOne({
      id,
      status: 'ACTIVE'
    });
    
    if (!key) {
      throw new KeyNotFoundError('registry', id, `No active version of key ${id}`);
    }
    
    return key as KeyMetadata;
  }

  /**
   * List all versions of a key
   */
  async listKeyVersions(id: string): Promise<KeyMetadata[]> {
    const db = getDatabase();
    
    const keys = await db.collection(this.collectionName)
      .find({ id })
      .sort({ version: -1 })
      .toArray();
    
    return keys as KeyMetadata[];
  }

  /**
   * List keys by purpose
   */
  async listKeysByPurpose(purpose: KeyPurpose): Promise<KeyMetadata[]> {
    const db = getDatabase();
    
    const keys = await db.collection(this.collectionName)
      .find({ purpose, status: 'ACTIVE' })
      .toArray();
    
    return keys as KeyMetadata[];
  }

  /**
   * List keys by tenant
   */
  async listKeysByTenant(tenantId: string): Promise<KeyMetadata[]> {
    const db = getDatabase();
    
    const keys = await db.collection(this.collectionName)
      .find({ tenantId, status: 'ACTIVE' })
      .toArray();
    
    return keys as KeyMetadata[];
  }

  /**
   * Update key status
   */
  async updateKeyStatus(id: string, version: number, status: KeyStatus): Promise<void> {
    const db = getDatabase();
    
    const update: any = {
      status,
      updatedAt: new Date()
    };
    
    if (status === 'ACTIVE') {
      update.activatedAt = new Date();
    } else if (status === 'RETIRED') {
      update.retiredAt = new Date();
    } else if (status === 'DESTROYED') {
      update.destroyedAt = new Date();
    }
    
    await db.collection(this.collectionName).updateOne(
      { id, version },
      { $set: update }
    );
    
    console.log(`[KeyRegistry] Updated key ${id} v${version} status: ${status}`);
  }

  /**
   * Update key policy
   */
  async updateKeyPolicy(id: string, version: number, policy: KeyPolicy): Promise<void> {
    const db = getDatabase();
    
    await db.collection(this.collectionName).updateOne(
      { id, version },
      {
        $set: {
          policy,
          updatedAt: new Date()
        }
      }
    );
    
    console.log(`[KeyRegistry] Updated policy for key ${id} v${version}`);
  }

  /**
   * Start key rotation
   * Creates new version and marks current as ROTATING
   */
  async startRotation(id: string, newMetadata: KeyMetadata): Promise<KeyMetadata> {
    const db = getDatabase();
    
    // Get current active version
    const currentKey = await this.getActiveKey(id);
    
    // Mark current version as rotating
    await this.updateKeyStatus(currentKey.id, currentKey.version, 'ROTATING');
    
    // Register new version
    await this.registerKey(newMetadata);
    
    console.log(
      `[KeyRegistry] Started rotation: ${id} v${currentKey.version} → v${newMetadata.version}`
    );
    
    return newMetadata;
  }

  /**
   * Complete key rotation
   * Activates new version and retires old version
   */
  async completeRotation(id: string, newVersion: number): Promise<void> {
    const db = getDatabase();
    
    // Activate new version
    await this.updateKeyStatus(id, newVersion, 'ACTIVE');
    
    // Find and retire previous rotating version
    const rotatingKeys = await db.collection(this.collectionName)
      .find({ id, status: 'ROTATING' })
      .toArray();
    
    for (const key of rotatingKeys) {
      await this.updateKeyStatus(id, key.version, 'RETIRED');
    }
    
    console.log(`[KeyRegistry] Completed rotation: ${id} v${newVersion} now active`);
  }

  /**
   * Get keys requiring rotation
   */
  async getKeysRequiringRotation(): Promise<KeyMetadata[]> {
    const db = getDatabase();
    
    const now = new Date();
    
    const keys = await db.collection(this.collectionName)
      .find({
        status: 'ACTIVE',
        'policy.rotationPolicy': { $exists: true }
      })
      .toArray() as KeyMetadata[];
    
    const keysNeedingRotation: KeyMetadata[] = [];
    
    for (const key of keys) {
      if (key.policy.rotationPolicy && key.activatedAt) {
        const rotateEveryMs = key.policy.rotationPolicy.rotateEveryDays * 24 * 60 * 60 * 1000;
        const nextRotation = new Date(key.activatedAt.getTime() + rotateEveryMs);
        
        if (now >= nextRotation) {
          keysNeedingRotation.push(key);
        }
      }
    }
    
    return keysNeedingRotation;
  }

  /**
   * Delete key metadata
   * Only deletes metadata, not the actual key in provider
   */
  async deleteKey(id: string, version: number): Promise<void> {
    const db = getDatabase();
    
    await db.collection(this.collectionName).deleteOne({ id, version });
    
    console.log(`[KeyRegistry] Deleted metadata for key ${id} v${version}`);
  }

  /**
   * Build key reference from metadata
   */
  buildKeyReference(metadata: KeyMetadata): KeyReference {
    return {
      id: metadata.id,
      provider: metadata.provider,
      purpose: metadata.purpose,
      version: metadata.version,
      tenantId: metadata.tenantId
    };
  }

  /**
   * Initialize registry (create indexes)
   */
  async initialize(): Promise<void> {
    const db = getDatabase();
    const collection = db.collection(this.collectionName);
    
    // Create indexes for efficient queries
    await collection.createIndex({ id: 1, version: 1 }, { unique: true });
    await collection.createIndex({ id: 1, status: 1 });
    await collection.createIndex({ purpose: 1, status: 1 });
    await collection.createIndex({ tenantId: 1, status: 1 });
    await collection.createIndex({ provider: 1 });
    await collection.createIndex({ createdAt: 1 });
    
    console.log('[KeyRegistry] ✓ Initialized with database indexes');
  }

  /**
   * Get registry statistics
   */
  async getStatistics(): Promise<{
    totalKeys: number;
    activeKeys: number;
    retiredKeys: number;
    keysByProvider: Record<string, number>;
    keysByPurpose: Record<string, number>;
  }> {
    const db = getDatabase();
    
    const totalKeys = await db.collection(this.collectionName).countDocuments({});
    const activeKeys = await db.collection(this.collectionName).countDocuments({ status: 'ACTIVE' });
    const retiredKeys = await db.collection(this.collectionName).countDocuments({ status: 'RETIRED' });
    
    const providerAgg = await db.collection(this.collectionName).aggregate([
      { $group: { _id: '$provider', count: { $sum: 1 } } }
    ]).toArray();
    
    const purposeAgg = await db.collection(this.collectionName).aggregate([
      { $match: { status: 'ACTIVE' } },
      { $group: { _id: '$purpose', count: { $sum: 1 } } }
    ]).toArray();
    
    const keysByProvider: Record<string, number> = {};
    for (const item of providerAgg) {
      keysByProvider[item._id] = item.count;
    }
    
    const keysByPurpose: Record<string, number> = {};
    for (const item of purposeAgg) {
      keysByPurpose[item._id] = item.count;
    }
    
    return {
      totalKeys,
      activeKeys,
      retiredKeys,
      keysByProvider,
      keysByPurpose
    };
  }
}
