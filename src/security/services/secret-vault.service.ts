/**
 * Secret Vault Service
 * Enterprise-grade secret management with encryption, rotation, and auditing
 */

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, createHash } from 'crypto';
import { ISecretVaultService, SecretFilters } from '../interfaces.js';
import {
  Secret,
  SecretType,
  SecretVersion,
  SecretAccessLog,
  RotationPolicy
} from '../types.js';
import { getDatabase } from '../../config/database.js';
import { EventEmitter } from 'events';

export class SecretVaultService extends EventEmitter implements ISecretVaultService {
  private masterKey: Buffer;
  private readonly ENCRYPTION_ALGORITHM = 'aes-256-gcm';
  private readonly KEY_DERIVATION_ITERATIONS = 100000;
  private readonly SALT_LENGTH = 32;
  private readonly IV_LENGTH = 16;
  private readonly AUTH_TAG_LENGTH = 16;

  constructor(masterPassword?: string) {
    super();
    
    // In production, this should come from HSM or secure key management
    const password = masterPassword || process.env.VAULT_MASTER_PASSWORD || this.generateSecurePassword();
    this.masterKey = this.deriveMasterKey(password);
  }

  /**
   * Derive master encryption key from password using PBKDF2
   */
  private deriveMasterKey(password: string): Buffer {
    const salt = process.env.VAULT_SALT || randomBytes(this.SALT_LENGTH).toString('hex');
    return pbkdf2Sync(
      password,
      salt,
      this.KEY_DERIVATION_ITERATIONS,
      32, // 256 bits
      'sha512'
    );
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  async encrypt(plaintext: string): Promise<string> {
    try {
      const iv = randomBytes(this.IV_LENGTH);
      const cipher = createCipheriv(this.ENCRYPTION_ALGORITHM, this.masterKey, iv);
      
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      const authTag = cipher.getAuthTag();
      
      // Combine: iv + authTag + encrypted data
      const combined = Buffer.concat([
        iv,
        authTag,
        Buffer.from(encrypted, 'base64')
      ]);
      
      return combined.toString('base64');
    } catch (error: unknown) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  async decrypt(ciphertext: string): Promise<string> {
    try {
      const combined = Buffer.from(ciphertext, 'base64');
      
      // Extract components
      const iv = combined.slice(0, this.IV_LENGTH);
      const authTag = combined.slice(this.IV_LENGTH, this.IV_LENGTH + this.AUTH_TAG_LENGTH);
      const encrypted = combined.slice(this.IV_LENGTH + this.AUTH_TAG_LENGTH);
      
      const decipher = createDecipheriv(this.ENCRYPTION_ALGORITHM, this.masterKey, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted.toString('base64'), 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error: unknown) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a new secret
   */
  async createSecret(
    name: string,
    type: SecretType,
    value: string,
    metadata: Record<string, any> = {}
  ): Promise<Secret> {
    const db = getDatabase();
    
    try {
      // Encrypt the secret value
      const encryptedValue = await this.encrypt(value);
      
      const secret: Secret = {
        id: this.generateId(),
        name,
        type,
        description: metadata.description || '',
        value: encryptedValue,
        metadata,
        tags: metadata.tags || [],
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: metadata.expiresAt,
        rotationPolicy: metadata.rotationPolicy,
        accessCount: 0
      };
      
      // Store in database
      await db.collection('secrets').insertOne(secret);
      
      // Create initial version
      await this.createVersion(secret.id, encryptedValue, 'system');
      
      // Log creation
      await this.logAccess(secret.id, 'system', 'create', true);
      
      this.emit('secret:created', { secretId: secret.id, name, type });
      
      return secret;
    } catch (error: unknown) {
      await this.logAccess('unknown', 'system', 'create', false);
      throw new Error(`Failed to create secret: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get a secret by ID
   */
  async getSecret(id: string, version?: number): Promise<Secret> {
    const db = getDatabase();
    
    try {
      let secret: Secret;
      
      if (version) {
        // Get specific version
        const secretVersion = await db.collection('secret_versions')
          .findOne({ secretId: id, version });
        
        if (!secretVersion) {
          throw new Error('Secret version not found');
        }
        
        const currentSecret = await db.collection('secrets').findOne({ id });
        secret = { ...currentSecret, value: secretVersion.value, version };
      } else {
        // Get current version
        secret = await db.collection('secrets').findOne({ id });
      }
      
      if (!secret) {
        throw new Error('Secret not found');
      }
      
      // Check expiration
      if (secret.expiresAt && secret.expiresAt < new Date()) {
        throw new Error('Secret has expired');
      }
      
      // Update access tracking
      await db.collection('secrets').updateOne(
        { id },
        {
          $inc: { accessCount: 1 },
          $set: { lastAccessedAt: new Date() }
        }
      );
      
      // Log access
      await this.logAccess(id, 'system', 'read', true);
      
      this.emit('secret:accessed', { secretId: id, version });
      
      return secret;
    } catch (error) {
      await this.logAccess(id, 'system', 'read', false);
      throw error;
    }
  }

  /**
   * Update a secret (creates new version)
   */
  async updateSecret(id: string, value: string): Promise<Secret> {
    const db = getDatabase();
    
    try {
      const secret = await this.getSecret(id);
      
      // Encrypt new value
      const encryptedValue = await this.encrypt(value);
      
      // Create new version
      const newVersion = secret.version + 1;
      await this.createVersion(id, encryptedValue, 'system');
      
      // Update secret
      const updatedSecret = await db.collection('secrets').findOneAndUpdate(
        { id },
        {
          $set: {
            value: encryptedValue,
            version: newVersion,
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      );
      
      await this.logAccess(id, 'system', 'write', true);
      
      this.emit('secret:updated', { secretId: id, version: newVersion });
      
      return updatedSecret.value;
    } catch (error: unknown) {
      await this.logAccess(id, 'system', 'write', false);
      throw new Error(`Failed to update secret: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete a secret
   */
  async deleteSecret(id: string): Promise<void> {
    const db = getDatabase();
    
    try {
      // Soft delete - mark as deleted but keep for audit
      await db.collection('secrets').updateOne(
        { id },
        {
          $set: {
            deleted: true,
            deletedAt: new Date()
          }
        }
      );
      
      await this.logAccess(id, 'system', 'delete', true);
      
      this.emit('secret:deleted', { secretId: id });
    } catch (error: unknown) {
      await this.logAccess(id, 'system', 'delete', false);
      throw new Error(`Failed to delete secret: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List secrets with filters
   */
  async listSecrets(filters: SecretFilters = {}): Promise<Secret[]> {
    const db = getDatabase();
    
    const query: any = { deleted: { $ne: true } };
    
    if (filters.type) {
      query.type = filters.type;
    }
    
    if (filters.tags && filters.tags.length > 0) {
      query.tags = { $in: filters.tags };
    }
    
    if (filters.expiringSoon) {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      query.expiresAt = {
        $gte: new Date(),
        $lte: thirtyDaysFromNow
      };
    }
    
    if (filters.needsRotation) {
      const now = new Date();
      query.$or = [
        { 'rotationPolicy.enabled': true, lastRotatedAt: null },
        {
          'rotationPolicy.enabled': true,
          $expr: {
            $gte: [
              { $subtract: [now, '$lastRotatedAt'] },
              { $multiply: ['$rotationPolicy.intervalDays', 24 * 60 * 60 * 1000] }
            ]
          }
        }
      ];
    }
    
    const secrets = await db.collection('secrets')
      .find(query)
      .sort({ name: 1 })
      .toArray();
    
    return secrets;
  }

  /**
   * Rotate a secret
   */
  async rotateSecret(id: string): Promise<Secret> {
    const db = getDatabase();
    
    try {
      const secret = await this.getSecret(id);
      
      if (!secret.rotationPolicy?.enabled) {
        throw new Error('Rotation not enabled for this secret');
      }
      
      // Generate new secret value based on type
      const newValue = await this.generateSecretValue(secret.type);
      
      // Update secret
      const rotatedSecret = await this.updateSecret(id, newValue);
      
      // Update rotation timestamp
      await db.collection('secrets').updateOne(
        { id },
        {
          $set: {
            lastRotatedAt: new Date()
          }
        }
      );
      
      await this.logAccess(id, 'system', 'rotate', true);
      
      this.emit('secret:rotated', { secretId: id });
      
      return rotatedSecret;
    } catch (error: unknown) {
      await this.logAccess(id, 'system', 'rotate', false);
      throw new Error(`Failed to rotate secret: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get secret versions
   */
  async getSecretVersions(secretId: string): Promise<SecretVersion[]> {
    const db = getDatabase();
    
    const versions = await db.collection('secret_versions')
      .find({ secretId })
      .sort({ version: -1 })
      .toArray();
    
    return versions;
  }

  /**
   * Create a version record
   */
  private async createVersion(secretId: string, value: string, userId: string): Promise<void> {
    const db = getDatabase();
    
    const secret = await db.collection('secrets').findOne({ id: secretId });
    
    const version: SecretVersion = {
      id: this.generateId(),
      secretId,
      version: secret.version,
      value,
      createdAt: new Date(),
      createdBy: userId
    };
    
    await db.collection('secret_versions').insertOne(version);
  }

  /**
   * Log secret access
   */
  async logAccess(
    secretId: string,
    userId: string,
    action: 'create' | 'read' | 'write' | 'rotate' | 'delete',
    success: boolean
  ): Promise<void> {
    const db = getDatabase();
    
    const log: SecretAccessLog = {
      id: this.generateId(),
      secretId,
      userId,
      action,
      timestamp: new Date(),
      ipAddress: 'internal', // Should be captured from request context
      success,
      reason: success ? undefined : 'Access denied or error occurred'
    };
    
    await db.collection('secret_access_logs').insertOne(log);
  }

  /**
   * Get access logs for a secret
   */
  async getAccessLogs(secretId: string, limit: number = 100): Promise<SecretAccessLog[]> {
    const db = getDatabase();
    
    const logs = await db.collection('secret_access_logs')
      .find({ secretId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
    
    return logs;
  }

  /**
   * Generate secure secret value based on type
   */
  private async generateSecretValue(type: SecretType): Promise<string> {
    switch (type) {
      case SecretType.PASSWORD:
        return this.generateSecurePassword(32);
      
      case SecretType.API_KEY:
        return this.generateApiKey();
      
      case SecretType.TOKEN:
        return this.generateToken();
      
      case SecretType.ENCRYPTION_KEY:
        return randomBytes(32).toString('base64');
      
      case SecretType.SIGNING_KEY:
        return randomBytes(64).toString('base64');
      
      default:
        return randomBytes(32).toString('hex');
    }
  }

  /**
   * Generate secure password
   */
  private generateSecurePassword(length: number = 32): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    const allChars = uppercase + lowercase + numbers + special;
    
    let password = '';
    
    // Ensure at least one of each type
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];
    
    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * allChars.length);
      password += allChars[randomIndex];
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Generate API key
   */
  private generateApiKey(): string {
    const prefix = 'vms';
    const key = randomBytes(32).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
    return `${prefix}_${key}`;
  }

  /**
   * Generate token
   */
  private generateToken(): string {
    return randomBytes(64).toString('hex');
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `secret_${Date.now()}_${randomBytes(8).toString('hex')}`;
  }

  /**
   * Auto-rotate secrets based on policies
   */
  async autoRotateSecrets(): Promise<void> {
    const secretsNeedingRotation = await this.listSecrets({ needsRotation: true });
    
    for (const secret of secretsNeedingRotation) {
      if (secret.rotationPolicy?.autoRotate) {
        try {
          await this.rotateSecret(secret.id);
          console.log(`Auto-rotated secret: ${secret.name}`);
        } catch (error) {
          console.error(`Failed to auto-rotate secret ${secret.name}:`, error);
          this.emit('secret:rotation-failed', { secretId: secret.id, error: error.message });
        }
      }
    }
  }

  /**
   * Check for expiring secrets and send notifications
   */
  async checkExpiringSecrets(): Promise<Secret[]> {
    const expiringSecrets = await this.listSecrets({ expiringSoon: true });
    
    for (const secret of expiringSecrets) {
      this.emit('secret:expiring-soon', {
        secretId: secret.id,
        name: secret.name,
        expiresAt: secret.expiresAt
      });
    }
    
    return expiringSecrets;
  }

  /**
   * Validate secret value against policy
   */
  validateSecretValue(value: string, type: SecretType): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!value || value.length === 0) {
      errors.push('Secret value cannot be empty');
    }
    
    if (type === SecretType.PASSWORD && value.length < 12) {
      errors.push('Password must be at least 12 characters');
    }
    
    if (type === SecretType.ENCRYPTION_KEY && value.length < 32) {
      errors.push('Encryption key must be at least 32 bytes');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Export secrets (encrypted) for backup
   */
  async exportSecrets(secretIds?: string[]): Promise<string> {
    const db = getDatabase();
    
    const query: any = { deleted: { $ne: true } };
    if (secretIds && secretIds.length > 0) {
      query.id = { $in: secretIds };
    }
    
    const secrets = await db.collection('secrets').find(query).toArray();
    
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      secrets: secrets.map((s: any) => ({
        ...s,
        value: undefined, // Don't export encrypted values in plaintext
        _encrypted: true
      }))
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const db = getDatabase();
      
      // Test encryption/decryption
      const testData = 'health-check-test';
      const encrypted = await this.encrypt(testData);
      const decrypted = await this.decrypt(encrypted);
      
      if (decrypted !== testData) {
        throw new Error('Encryption/decryption test failed');
      }
      
      // Get stats
      const totalSecrets = await db.collection('secrets').countDocuments({ deleted: { $ne: true } });
      const expiringSecrets = (await this.listSecrets({ expiringSoon: true })).length;
      const needsRotation = (await this.listSecrets({ needsRotation: true })).length;
      
      return {
        status: 'healthy',
        details: {
          totalSecrets,
          expiringSecrets,
          needsRotation,
          encryptionTest: 'passed'
        }
      };
    } catch (error: unknown) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }
}
