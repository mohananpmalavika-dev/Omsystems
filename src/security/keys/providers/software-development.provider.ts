/**
 * Software Development Key Provider
 * 
 * Pure software implementation for development and testing
 * Uses Node.js crypto module with keys stored in memory or filesystem
 * 
 * SECURITY NOTICE:
 * - Private keys stored in process memory or filesystem
 * - No hardware security guarantees
 * - Suitable for development and testing ONLY
 * - MUST NOT be used in production
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { KeyProvider } from '../key-provider.interface.js';
import {
  KeyProviderCapabilities,
  SignRequest,
  SignatureResult,
  VerifyRequest,
  VerificationResult,
  EncryptRequest,
  EncryptionResult,
  DecryptRequest,
  DecryptionResult,
  GenerateKeyRequest,
  KeyMetadata,
  PublicKeyResult,
  ProviderHealth,
  KeyReference,
  SoftwareDevelopmentProviderConfig,
  KeyStatus,
  SigningAlgorithm,
  EncryptionAlgorithm
} from '../types.js';
import {
  KeyNotFoundError,
  UnsupportedAlgorithmError,
  InvalidInputError,
  InitializationFailedError
} from '../errors.js';

interface StoredKey {
  metadata: KeyMetadata;
  privateKey?: crypto.KeyObject;
  publicKey?: crypto.KeyObject;
  secretKey?: Buffer;
  privateKeyPem?: string;
  publicKeyPem?: string;
}

export class SoftwareDevelopmentProvider implements KeyProvider {
  private initialized: boolean = false;
  private keys: Map<string, StoredKey> = new Map();
  private config: SoftwareDevelopmentProviderConfig;
  private keyStoragePath?: string;

  constructor(config: SoftwareDevelopmentProviderConfig) {
    this.config = config;
    this.keyStoragePath = config.keyStoragePath;
  }

  getName(): string {
    return 'software-development';
  }

  async initialize(): Promise<void> {
    console.log('[SoftwareDevelopmentProvider] Initializing...');

    try {
      // Load existing keys from filesystem if storage path configured
      if (this.keyStoragePath) {
        await this.loadKeysFromStorage();
      }

      this.initialized = true;
      
      console.log('[SoftwareDevelopmentProvider] ✓ Initialized');
      console.log('[SoftwareDevelopmentProvider] ⚠️  SOFTWARE PROVIDER - Development/testing only');
      console.log('[SoftwareDevelopmentProvider] ⚠️  No hardware security guarantees');
    } catch (error: any) {
      throw new InitializationFailedError(
        'software-development',
        `Failed to initialize software development provider: ${error.message}`,
        error
      );
    }
  }

  getCapabilities(): KeyProviderCapabilities {
    return {
      securityLevel: 'SOFTWARE',
      operations: {
        sign: true,
        verify: true,
        encrypt: true,
        decrypt: true,
        generateKey: true,
        destroyKey: true,
        getPublicKey: true,
        wrapKey: true,
        unwrapKey: true
      },
      keyTypes: {
        rsa: true,
        ec: true,
        aes: true
      },
      signingAlgorithms: [
        'RSA_PKCS1_SHA256',
        'RSA_PSS_SHA256',
        'ECDSA_SHA256',
        'ECDSA_SHA384',
        'ECDSA_SHA512'
      ],
      encryptionAlgorithms: [
        'RSA_OAEP_SHA256',
        'AES_256_GCM',
        'AES_256_CBC'
      ],
      privateKeyExportable: true,
      attestedHardware: false,
      fipsMode: false,
      metadata: {
        description: 'Node.js crypto module (software only)',
        warning: 'Development and testing only - no hardware security'
      }
    };
  }

  async sign(request: SignRequest): Promise<SignatureResult> {
    this.assertInitialized();

    const key = this.getKey(request.key);
    
    if (!key.privateKey && !key.privateKeyPem) {
      throw new KeyNotFoundError(
        this.getName(),
        request.key.id,
        'Private key not available for signing'
      );
    }

    const algorithm = this.mapSigningAlgorithm(request.algorithm);
    
    let signature: Buffer;
    
    if (key.privateKey) {
      signature = crypto.sign(algorithm, request.data, key.privateKey);
    } else if (key.privateKeyPem) {
      const sign = crypto.createSign(algorithm);
      sign.update(request.data);
      sign.end();
      signature = sign.sign(key.privateKeyPem);
    } else {
      throw new Error('No private key available');
    }

    return {
      signature,
      algorithm: request.algorithm,
      keyId: request.key.id,
      keyVersion: request.key.version,
      provider: this.getName(),
      timestamp: new Date()
    };
  }

  async verify(request: VerifyRequest): Promise<VerificationResult> {
    this.assertInitialized();

    const key = this.getKey(request.key);
    
    if (!key.publicKey && !key.publicKeyPem) {
      throw new KeyNotFoundError(
        this.getName(),
        request.key.id,
        'Public key not available for verification'
      );
    }

    const algorithm = this.mapSigningAlgorithm(request.algorithm);
    
    let valid: boolean;
    
    try {
      if (key.publicKey) {
        valid = crypto.verify(algorithm, request.data, key.publicKey, request.signature);
      } else if (key.publicKeyPem) {
        const verify = crypto.createVerify(algorithm);
        verify.update(request.data);
        verify.end();
        valid = verify.verify(key.publicKeyPem, request.signature);
      } else {
        valid = false;
      }
    } catch (error) {
      valid = false;
    }

    return {
      valid,
      algorithm: request.algorithm,
      keyId: request.key.id,
      keyVersion: request.key.version,
      provider: this.getName(),
      timestamp: new Date()
    };
  }

  async encrypt(request: EncryptRequest): Promise<EncryptionResult> {
    this.assertInitialized();

    const key = this.getKey(request.key);

    if (request.algorithm === 'RSA_OAEP_SHA256') {
      // Asymmetric encryption
      if (!key.publicKey && !key.publicKeyPem) {
        throw new KeyNotFoundError(
          this.getName(),
          request.key.id,
          'Public key not available for encryption'
        );
      }

      const publicKey = key.publicKey ?? crypto.createPublicKey(key.publicKeyPem!);
      
      const ciphertext = crypto.publicEncrypt(
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256'
        },
        request.plaintext
      );

      return {
        ciphertext,
        iv: Buffer.alloc(0),
        algorithm: request.algorithm,
        keyId: request.key.id,
        keyVersion: request.key.version,
        provider: this.getName(),
        timestamp: new Date()
      };
    } else if (request.algorithm === 'AES_256_GCM') {
      // Symmetric encryption
      if (!key.secretKey) {
        throw new KeyNotFoundError(
          this.getName(),
          request.key.id,
          'Secret key not available for encryption'
        );
      }

      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key.secretKey, iv);
      
      const ciphertext = Buffer.concat([
        cipher.update(request.plaintext),
        cipher.final()
      ]);
      
      const authTag = cipher.getAuthTag();

      return {
        ciphertext,
        iv,
        authTag,
        algorithm: request.algorithm,
        keyId: request.key.id,
        keyVersion: request.key.version,
        provider: this.getName(),
        timestamp: new Date()
      };
    } else {
      throw new UnsupportedAlgorithmError(
        this.getName(),
        request.algorithm,
        'encrypt'
      );
    }
  }

  async decrypt(request: DecryptRequest): Promise<DecryptionResult> {
    this.assertInitialized();

    const key = this.getKey(request.key);

    if (request.algorithm === 'RSA_OAEP_SHA256') {
      // Asymmetric decryption
      if (!key.privateKey && !key.privateKeyPem) {
        throw new KeyNotFoundError(
          this.getName(),
          request.key.id,
          'Private key not available for decryption'
        );
      }

      const privateKey = key.privateKey ?? crypto.createPrivateKey(key.privateKeyPem!);
      
      const plaintext = crypto.privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256'
        },
        request.ciphertext
      );

      return {
        plaintext,
        algorithm: request.algorithm,
        keyId: request.key.id,
        keyVersion: request.key.version,
        provider: this.getName(),
        timestamp: new Date()
      };
    } else if (request.algorithm === 'AES_256_GCM') {
      // Symmetric decryption
      if (!key.secretKey) {
        throw new KeyNotFoundError(
          this.getName(),
          request.key.id,
          'Secret key not available for decryption'
        );
      }

      if (!request.iv || !request.authTag) {
        throw new InvalidInputError(
          'AES-GCM decryption requires IV and auth tag'
        );
      }

      const decipher = crypto.createDecipheriv('aes-256-gcm', key.secretKey, request.iv);
      decipher.setAuthTag(request.authTag);
      
      const plaintext = Buffer.concat([
        decipher.update(request.ciphertext),
        decipher.final()
      ]);

      return {
        plaintext,
        algorithm: request.algorithm,
        keyId: request.key.id,
        keyVersion: request.key.version,
        provider: this.getName(),
        timestamp: new Date()
      };
    } else {
      throw new UnsupportedAlgorithmError(
        this.getName(),
        request.algorithm,
        'decrypt'
      );
    }
  }

  async generateKey(request: GenerateKeyRequest): Promise<KeyMetadata> {
    this.assertInitialized();

    const keyId = this.generateKeyId();
    const metadata: KeyMetadata = {
      id: keyId,
      tenantId: request.tenantId,
      provider: this.getName(),
      externalKeyId: keyId,
      purpose: request.purpose,
      algorithm: `${request.algorithm.type}${request.algorithm.keySize ? '-' + request.algorithm.keySize : ''}`,
      keyType: request.algorithm.type,
      keySize: request.algorithm.keySize,
      version: 1,
      securityLevel: 'SOFTWARE',
      status: 'ACTIVE' as KeyStatus,
      policy: request.policy,
      createdAt: new Date(),
      activatedAt: new Date(),
      metadata: request.metadata
    };

    const storedKey: StoredKey = { metadata };

    if (request.algorithm.type === 'RSA') {
      const keySize = request.algorithm.keySize ?? 2048;
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: keySize,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      storedKey.privateKey = crypto.createPrivateKey(privateKey);
      storedKey.publicKey = crypto.createPublicKey(publicKey);
      storedKey.privateKeyPem = privateKey;
      storedKey.publicKeyPem = publicKey;
      
      metadata.keySize = keySize;
    } else if (request.algorithm.type === 'EC') {
      const namedCurve = this.mapECCurve(request.algorithm.curve ?? 'P-256');
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
        namedCurve,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      storedKey.privateKey = crypto.createPrivateKey(privateKey);
      storedKey.publicKey = crypto.createPublicKey(publicKey);
      storedKey.privateKeyPem = privateKey;
      storedKey.publicKeyPem = publicKey;
      
      metadata.algorithm = `EC-${request.algorithm.curve ?? 'P-256'}`;
    } else if (request.algorithm.type === 'AES') {
      const keySize = request.algorithm.keySize ?? 256;
      const secretKey = crypto.randomBytes(keySize / 8);
      
      storedKey.secretKey = secretKey;
      metadata.keySize = keySize;
    } else {
      throw new UnsupportedAlgorithmError(
        this.getName(),
        request.algorithm.type,
        'generateKey'
      );
    }

    this.keys.set(keyId, storedKey);

    // Persist to filesystem if configured
    if (this.keyStoragePath) {
      await this.saveKeyToStorage(storedKey);
    }

    console.log(`[SoftwareDevelopmentProvider] Generated key: ${keyId} (${metadata.algorithm})`);

    return metadata;
  }

  async getPublicKey(
    keyRef: KeyReference,
    format: 'PEM' | 'DER' | 'JWK' = 'PEM'
  ): Promise<PublicKeyResult> {
    this.assertInitialized();

    const key = this.getKey(keyRef);
    
    if (!key.publicKey && !key.publicKeyPem) {
      throw new KeyNotFoundError(
        this.getName(),
        keyRef.id,
        'Public key not available'
      );
    }

    const publicKey = key.publicKey ?? crypto.createPublicKey(key.publicKeyPem!);
    
    let publicKeyBuffer: Buffer;
    
    if (format === 'PEM') {
      publicKeyBuffer = Buffer.from(
        publicKey.export({ type: 'spki', format: 'pem' })
      );
    } else if (format === 'DER') {
      publicKeyBuffer = publicKey.export({ type: 'spki', format: 'der' });
    } else if (format === 'JWK') {
      const jwk = publicKey.export({ format: 'jwk' });
      publicKeyBuffer = Buffer.from(JSON.stringify(jwk));
    } else {
      throw new InvalidInputError(`Unsupported format: ${format}`);
    }

    return {
      publicKey: publicKeyBuffer,
      format,
      keyId: keyRef.id,
      algorithm: key.metadata.algorithm
    };
  }

  async destroyKey(keyRef: KeyReference): Promise<void> {
    this.assertInitialized();

    const keyId = this.buildKeyId(keyRef);
    
    if (!this.keys.has(keyId)) {
      throw new KeyNotFoundError(
        this.getName(),
        keyRef.id,
        'Key not found'
      );
    }

    this.keys.delete(keyId);

    // Remove from filesystem if configured
    if (this.keyStoragePath) {
      await this.deleteKeyFromStorage(keyId);
    }

    console.log(`[SoftwareDevelopmentProvider] Destroyed key: ${keyId}`);
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      status: this.initialized ? 'HEALTHY' : 'UNAVAILABLE',
      state: this.initialized ? 'READY' : 'UNINITIALIZED',
      checkedAt: new Date(),
      details: {
        initialized: this.initialized,
        keyCount: this.keys.size,
        storagePath: this.keyStoragePath
      }
    };
  }

  async shutdown(): Promise<void> {
    console.log('[SoftwareDevelopmentProvider] Shutting down...');
    
    // Clear keys from memory
    this.keys.clear();
    this.initialized = false;
    
    console.log('[SoftwareDevelopmentProvider] ✓ Shutdown complete');
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('Provider not initialized');
    }
  }

  private getKey(keyRef: KeyReference): StoredKey {
    const keyId = this.buildKeyId(keyRef);
    const key = this.keys.get(keyId);
    
    if (!key) {
      throw new KeyNotFoundError(
        this.getName(),
        keyRef.id,
        `Key not found: ${keyId}`
      );
    }
    
    return key;
  }

  private buildKeyId(keyRef: KeyReference): string {
    return `${keyRef.id}-v${keyRef.version}${keyRef.tenantId ? `-${keyRef.tenantId}` : ''}`;
  }

  private generateKeyId(): string {
    return `key-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  }

  private mapSigningAlgorithm(algorithm: SigningAlgorithm): string {
    switch (algorithm) {
      case 'RSA_PKCS1_SHA256':
        return 'sha256';
      case 'RSA_PSS_SHA256':
        return 'sha256'; // PSS handled via padding in sign/verify
      case 'ECDSA_SHA256':
        return 'sha256';
      case 'ECDSA_SHA384':
        return 'sha384';
      case 'ECDSA_SHA512':
        return 'sha512';
      default:
        throw new UnsupportedAlgorithmError(this.getName(), algorithm, 'sign');
    }
  }

  private mapECCurve(curve: 'P-256' | 'P-384' | 'P-521'): string {
    switch (curve) {
      case 'P-256':
        return 'prime256v1';
      case 'P-384':
        return 'secp384r1';
      case 'P-521':
        return 'secp521r1';
      default:
        throw new InvalidInputError(`Unsupported curve: ${curve}`);
    }
  }

  // ============================================================================
  // Storage Methods
  // ============================================================================

  private async loadKeysFromStorage(): Promise<void> {
    if (!this.keyStoragePath) {
      return;
    }

    try {
      await fs.mkdir(this.keyStoragePath, { recursive: true });
      
      const files = await fs.readdir(this.keyStoragePath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const keyPath = path.join(this.keyStoragePath, file);
          const data = await fs.readFile(keyPath, 'utf-8');
          const storedKey: StoredKey = JSON.parse(data);
          
          // Reconstruct key objects from PEM
          if (storedKey.privateKeyPem) {
            storedKey.privateKey = crypto.createPrivateKey(storedKey.privateKeyPem);
          }
          if (storedKey.publicKeyPem) {
            storedKey.publicKey = crypto.createPublicKey(storedKey.publicKeyPem);
          }
          if (storedKey.secretKey) {
            storedKey.secretKey = Buffer.from(storedKey.secretKey as any, 'base64');
          }
          
          this.keys.set(storedKey.metadata.id, storedKey);
        }
      }
      
      console.log(`[SoftwareDevelopmentProvider] Loaded ${this.keys.size} keys from storage`);
    } catch (error: any) {
      console.warn(`[SoftwareDevelopmentProvider] Failed to load keys from storage: ${error.message}`);
    }
  }

  private async saveKeyToStorage(storedKey: StoredKey): Promise<void> {
    if (!this.keyStoragePath) {
      return;
    }

    try {
      await fs.mkdir(this.keyStoragePath, { recursive: true });
      
      const keyPath = path.join(this.keyStoragePath, `${storedKey.metadata.id}.json`);
      
      // Serialize for storage (exclude KeyObject instances)
      const serializable = {
        metadata: storedKey.metadata,
        privateKeyPem: storedKey.privateKeyPem,
        publicKeyPem: storedKey.publicKeyPem,
        secretKey: storedKey.secretKey?.toString('base64')
      };
      
      await fs.writeFile(keyPath, JSON.stringify(serializable, null, 2), 'utf-8');
    } catch (error: any) {
      console.warn(`[SoftwareDevelopmentProvider] Failed to save key to storage: ${error.message}`);
    }
  }

  private async deleteKeyFromStorage(keyId: string): Promise<void> {
    if (!this.keyStoragePath) {
      return;
    }

    try {
      const keyPath = path.join(this.keyStoragePath, `${keyId}.json`);
      await fs.unlink(keyPath);
    } catch (error: any) {
      console.warn(`[SoftwareDevelopmentProvider] Failed to delete key from storage: ${error.message}`);
    }
  }
}
