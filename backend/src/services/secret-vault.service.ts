/**
 * Secret Vault Service
 * Multi-provider secret management: HashiCorp Vault, Azure Key Vault, AWS Secrets Manager, GCP Secret Manager
 */

import {
  SecretVaultConfig,
  SecretProvider,
  Secret,
  RotationPolicy
} from '../types/security.types';
import crypto from 'crypto';

export class SecretVaultService {
  private config: SecretVaultConfig;
  private client: any;
  private encryptionKey: Buffer;

  constructor(config: SecretVaultConfig) {
    this.config = config;
    this.encryptionKey = this.deriveEncryptionKey();
    this.initializeClient();
  }

  /**
   * Initialize the appropriate vault client
   */
  private async initializeClient(): Promise<void> {
    switch (this.config.provider) {
      case SecretProvider.HASHICORP_VAULT:
        await this.initializeHashiCorpVault();
        break;
      case SecretProvider.AZURE_KEY_VAULT:
        await this.initializeAzureKeyVault();
        break;
      case SecretProvider.AWS_SECRETS_MANAGER:
        await this.initializeAWSSecretsManager();
        break;
      case SecretProvider.GCP_SECRET_MANAGER:
        await this.initializeGCPSecretManager();
        break;
      case SecretProvider.LOCAL_ENCRYPTED:
        await this.initializeLocalEncrypted();
        break;
      default:
        throw new Error(`Unsupported provider: ${this.config.provider}`);
    }
  }

  /**
   * HashiCorp Vault initialization
   */
  private async initializeHashiCorpVault(): Promise<void> {
    try {
      const vault = require('node-vault');
      
      this.client = vault({
        apiVersion: 'v1',
        endpoint: this.config.endpoint,
        token: this.config.token
      });

      // Authenticate with AppRole if configured
      if (this.config.roleId && this.config.secretId) {
        const result = await this.client.approleLogin({
          role_id: this.config.roleId,
          secret_id: this.config.secretId
        });
        this.client.token = result.auth.client_token;
      }

      console.log('✓ HashiCorp Vault initialized');
    } catch (error) {
      console.error('Failed to initialize HashiCorp Vault:', error);
      throw error;
    }
  }

  /**
   * Azure Key Vault initialization
   */
  private async initializeAzureKeyVault(): Promise<void> {
    try {
      const { SecretClient } = require('@azure/keyvault-secrets');
      const { DefaultAzureCredential } = require('@azure/identity');

      const credential = new DefaultAzureCredential();
      const vaultUrl = `https://${this.config.keyVaultName}.vault.azure.net`;
      
      this.client = new SecretClient(vaultUrl, credential);
      
      console.log('✓ Azure Key Vault initialized');
    } catch (error) {
      console.error('Failed to initialize Azure Key Vault:', error);
      throw error;
    }
  }

  /**
   * AWS Secrets Manager initialization
   */
  private async initializeAWSSecretsManager(): Promise<void> {
    try {
      const AWS = require('aws-sdk');
      
      this.client = new AWS.SecretsManager({
        region: this.config.region || 'us-east-1'
      });
      
      console.log('✓ AWS Secrets Manager initialized');
    } catch (error) {
      console.error('Failed to initialize AWS Secrets Manager:', error);
      throw error;
    }
  }

  /**
   * GCP Secret Manager initialization
   */
  private async initializeGCPSecretManager(): Promise<void> {
    try {
      const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
      
      this.client = new SecretManagerServiceClient({
        projectId: this.config.projectId
      });
      
      console.log('✓ GCP Secret Manager initialized');
    } catch (error) {
      console.error('Failed to initialize GCP Secret Manager:', error);
      throw error;
    }
  }

  /**
   * Local encrypted storage initialization
   */
  private async initializeLocalEncrypted(): Promise<void> {
    console.log('✓ Local encrypted storage initialized');
  }

  /**
   * Store a secret
   */
  async storeSecret(path: string, key: string, value: string, metadata?: Record<string, any>): Promise<Secret> {
    try {
      switch (this.config.provider) {
        case SecretProvider.HASHICORP_VAULT:
          return await this.storeHashiCorpSecret(path, key, value, metadata);
        
        case SecretProvider.AZURE_KEY_VAULT:
          return await this.storeAzureSecret(path, key, value, metadata);
        
        case SecretProvider.AWS_SECRETS_MANAGER:
          return await this.storeAWSSecret(path, key, value, metadata);
        
        case SecretProvider.GCP_SECRET_MANAGER:
          return await this.storeGCPSecret(path, key, value, metadata);
        
        case SecretProvider.LOCAL_ENCRYPTED:
          return await this.storeLocalSecret(path, key, value, metadata);
        
        default:
          throw new Error(`Unsupported provider: ${this.config.provider}`);
      }
    } catch (error) {
      console.error(`Failed to store secret ${path}/${key}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve a secret
   */
  async getSecret(path: string, key: string): Promise<Secret | null> {
    try {
      switch (this.config.provider) {
        case SecretProvider.HASHICORP_VAULT:
          return await this.getHashiCorpSecret(path, key);
        
        case SecretProvider.AZURE_KEY_VAULT:
          return await this.getAzureSecret(path, key);
        
        case SecretProvider.AWS_SECRETS_MANAGER:
          return await this.getAWSSecret(path, key);
        
        case SecretProvider.GCP_SECRET_MANAGER:
          return await this.getGCPSecret(path, key);
        
        case SecretProvider.LOCAL_ENCRYPTED:
          return await this.getLocalSecret(path, key);
        
        default:
          throw new Error(`Unsupported provider: ${this.config.provider}`);
      }
    } catch (error) {
      console.error(`Failed to retrieve secret ${path}/${key}:`, error);
      return null;
    }
  }

  /**
   * Delete a secret
   */
  async deleteSecret(path: string, key: string): Promise<boolean> {
    try {
      switch (this.config.provider) {
        case SecretProvider.HASHICORP_VAULT:
          await this.client.delete(`${path}/data/${key}`);
          return true;
        
        case SecretProvider.AZURE_KEY_VAULT:
          await this.client.beginDeleteSecret(key);
          return true;
        
        case SecretProvider.AWS_SECRETS_MANAGER:
          await this.client.deleteSecret({ SecretId: `${path}/${key}` }).promise();
          return true;
        
        case SecretProvider.GCP_SECRET_MANAGER:
          const name = `projects/${this.config.projectId}/secrets/${path}-${key}`;
          await this.client.deleteSecret({ name });
          return true;
        
        case SecretProvider.LOCAL_ENCRYPTED:
          // Implement local deletion
          return true;
        
        default:
          return false;
      }
    } catch (error) {
      console.error(`Failed to delete secret ${path}/${key}:`, error);
      return false;
    }
  }

  /**
   * List secrets in a path
   */
  async listSecrets(path: string): Promise<string[]> {
    try {
      switch (this.config.provider) {
        case SecretProvider.HASHICORP_VAULT:
          const result = await this.client.list(`${path}/metadata`);
          return result.data.keys || [];
        
        case SecretProvider.AZURE_KEY_VAULT:
          const secrets: string[] = [];
          for await (const properties of this.client.listPropertiesOfSecrets()) {
            if (properties.name.startsWith(path)) {
              secrets.push(properties.name);
            }
          }
          return secrets;
        
        case SecretProvider.AWS_SECRETS_MANAGER:
          const awsSecrets = await this.client.listSecrets().promise();
          return awsSecrets.SecretList
            ?.filter(s => s.Name?.startsWith(path))
            .map(s => s.Name!) || [];
        
        case SecretProvider.GCP_SECRET_MANAGER:
          const [gcpSecrets] = await this.client.listSecrets({
            parent: `projects/${this.config.projectId}`
          });
          return gcpSecrets
            .filter(s => s.name?.includes(path))
            .map(s => s.name!) || [];
        
        case SecretProvider.LOCAL_ENCRYPTED:
          return [];
        
        default:
          return [];
      }
    } catch (error) {
      console.error(`Failed to list secrets in ${path}:`, error);
      return [];
    }
  }

  /**
   * Rotate a secret
   */
  async rotateSecret(path: string, key: string, newValue: string): Promise<Secret> {
    // Store old version
    const oldSecret = await this.getSecret(path, key);
    
    // Store new version
    const newSecret = await this.storeSecret(path, key, newValue, {
      rotated: true,
      rotatedAt: new Date().toISOString(),
      previousVersion: oldSecret?.version || 0
    });
    
    return newSecret;
  }

  // ============================================================================
  // Provider-specific implementations
  // ============================================================================

  private async storeHashiCorpSecret(path: string, key: string, value: string, metadata?: Record<string, any>): Promise<Secret> {
    const result = await this.client.write(`${path}/data/${key}`, {
      data: { value },
      metadata: metadata || {}
    });

    return {
      id: `${path}/${key}`,
      path,
      key,
      value,
      metadata: metadata || {},
      version: result.data.version,
      createdAt: new Date()
    };
  }

  private async getHashiCorpSecret(path: string, key: string): Promise<Secret | null> {
    const result = await this.client.read(`${path}/data/${key}`);
    
    if (!result?.data?.data) {
      return null;
    }

    return {
      id: `${path}/${key}`,
      path,
      key,
      value: result.data.data.value,
      metadata: result.data.metadata || {},
      version: result.data.metadata.version,
      createdAt: new Date(result.data.metadata.created_time)
    };
  }

  private async storeAzureSecret(path: string, key: string, value: string, metadata?: Record<string, any>): Promise<Secret> {
    const secretName = `${path}-${key}`.replace(/\//g, '-');
    const result = await this.client.setSecret(secretName, value, {
      contentType: 'application/json',
      tags: metadata
    });

    return {
      id: result.name,
      path,
      key,
      value,
      metadata: result.properties.tags || {},
      version: 1,
      createdAt: result.properties.createdOn || new Date()
    };
  }

  private async getAzureSecret(path: string, key: string): Promise<Secret | null> {
    const secretName = `${path}-${key}`.replace(/\//g, '-');
    const result = await this.client.getSecret(secretName);
    
    if (!result) {
      return null;
    }

    return {
      id: result.name,
      path,
      key,
      value: result.value || '',
      metadata: result.properties.tags || {},
      version: 1,
      createdAt: result.properties.createdOn || new Date()
    };
  }

  private async storeAWSSecret(path: string, key: string, value: string, metadata?: Record<string, any>): Promise<Secret> {
    const secretName = `${path}/${key}`;
    
    try {
      await this.client.createSecret({
        Name: secretName,
        SecretString: value,
        Tags: Object.entries(metadata || {}).map(([Key, Value]) => ({
          Key,
          Value: String(Value)
        }))
      }).promise();
    } catch (error: any) {
      if (error.code === 'ResourceExistsException') {
        await this.client.putSecretValue({
          SecretId: secretName,
          SecretString: value
        }).promise();
      } else {
        throw error;
      }
    }

    return {
      id: secretName,
      path,
      key,
      value,
      metadata: metadata || {},
      version: 1,
      createdAt: new Date()
    };
  }

  private async getAWSSecret(path: string, key: string): Promise<Secret | null> {
    const secretName = `${path}/${key}`;
    
    try {
      const result = await this.client.getSecretValue({
        SecretId: secretName
      }).promise();

      return {
        id: result.ARN || secretName,
        path,
        key,
        value: result.SecretString || '',
        metadata: {},
        version: 1,
        createdAt: result.CreatedDate || new Date()
      };
    } catch (error: any) {
      if (error.code === 'ResourceNotFoundException') {
        return null;
      }
      throw error;
    }
  }

  private async storeGCPSecret(path: string, key: string, value: string, metadata?: Record<string, any>): Promise<Secret> {
    const secretName = `${path}-${key}`.replace(/\//g, '-');
    const parent = `projects/${this.config.projectId}`;
    const secretId = secretName;

    // Create or update secret
    try {
      await this.client.createSecret({
        parent,
        secretId,
        secret: {
          replication: {
            automatic: {}
          },
          labels: metadata || {}
        }
      });
    } catch (error: any) {
      if (error.code !== 6) { // Already exists
        throw error;
      }
    }

    // Add secret version
    await this.client.addSecretVersion({
      parent: `${parent}/secrets/${secretId}`,
      payload: {
        data: Buffer.from(value, 'utf8')
      }
    });

    return {
      id: secretId,
      path,
      key,
      value,
      metadata: metadata || {},
      version: 1,
      createdAt: new Date()
    };
  }

  private async getGCPSecret(path: string, key: string): Promise<Secret | null> {
    const secretName = `${path}-${key}`.replace(/\//g, '-');
    const name = `projects/${this.config.projectId}/secrets/${secretName}/versions/latest`;

    try {
      const [version] = await this.client.accessSecretVersion({ name });
      const value = version.payload?.data?.toString('utf8') || '';

      return {
        id: secretName,
        path,
        key,
        value,
        metadata: {},
        version: 1,
        createdAt: new Date()
      };
    } catch (error: any) {
      if (error.code === 5) { // Not found
        return null;
      }
      throw error;
    }
  }

  private async storeLocalSecret(path: string, key: string, value: string, metadata?: Record<string, any>): Promise<Secret> {
    const encrypted = this.encrypt(value);
    
    // In production, store in a database
    const secret: Secret = {
      id: `${path}/${key}`,
      path,
      key,
      value: encrypted,
      metadata: metadata || {},
      version: 1,
      createdAt: new Date()
    };

    return secret;
  }

  private async getLocalSecret(path: string, key: string): Promise<Secret | null> {
    // In production, retrieve from database
    return null;
  }

  // ============================================================================
  // Encryption helpers
  // ============================================================================

  private deriveEncryptionKey(): Buffer {
    const secret = process.env.VAULT_ENCRYPTION_KEY || 'default-secret-key-change-in-production';
    return crypto.scryptSync(secret, 'salt', 32);
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  private decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; provider: string; message: string }> {
    try {
      // Test connectivity
      await this.listSecrets('health-check');
      
      return {
        healthy: true,
        provider: this.config.provider,
        message: 'Vault connection healthy'
      };
    } catch (error: any) {
      return {
        healthy: false,
        provider: this.config.provider,
        message: error.message
      };
    }
  }
}

// ============================================================================
// Factory function
// ============================================================================

export function createSecretVault(config: SecretVaultConfig): SecretVaultService {
  return new SecretVaultService(config);
}

// ============================================================================
// Usage examples
// ============================================================================

/*
// HashiCorp Vault
const vaultConfig: SecretVaultConfig = {
  provider: SecretProvider.HASHICORP_VAULT,
  endpoint: 'http://vault:8200',
  token: process.env.VAULT_TOKEN!
};

// Azure Key Vault
const azureConfig: SecretVaultConfig = {
  provider: SecretProvider.AZURE_KEY_VAULT,
  endpoint: '',
  keyVaultName: 'sentinel-grid-vault'
};

// AWS Secrets Manager
const awsConfig: SecretVaultConfig = {
  provider: SecretProvider.AWS_SECRETS_MANAGER,
  endpoint: '',
  region: 'us-east-1'
};

// Usage
const vault = createSecretVault(vaultConfig);

// Store camera password
await vault.storeSecret('cameras', 'branch-01-cam-001', 'secure-password-123', {
  cameraId: 'CAM-001',
  branch: 'Branch-01'
});

// Retrieve camera password
const secret = await vault.getSecret('cameras', 'branch-01-cam-001');
console.log('Password:', secret?.value);

// Rotate password
await vault.rotateSecret('cameras', 'branch-01-cam-001', 'new-secure-password-456');
*/
