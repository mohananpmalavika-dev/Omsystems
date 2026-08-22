/**
 * KeyService Integration Tests
 * 
 * These tests validate the complete KeyService architecture
 * Tests can run with SoftwareDevelopmentProvider without external dependencies
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  KeyService,
  SoftwareDevelopmentProvider,
  KeyRegistryService,
  KeyPolicyService,
  KeyAuditService,
  KeyPolicyViolationError,
  KeyNotFoundError
} from '../index.js';

describe('KeyService Integration', () => {
  let keyService: KeyService;
  let provider: SoftwareDevelopmentProvider;
  let registry: KeyRegistryService;
  let policy: KeyPolicyService;
  let audit: KeyAuditService;

  beforeEach(async () => {
    // Create services with software provider (no external dependencies)
    provider = new SoftwareDevelopmentProvider({
      type: 'software-development'
    });

    registry = new KeyRegistryService();
    policy = new KeyPolicyService(registry);
    audit = new KeyAuditService();

    keyService = new KeyService(provider, registry, policy, audit);
    await keyService.initialize();
  });

  afterEach(async () => {
    await keyService.shutdown();
  });

  describe('Key Generation', () => {
    it('should generate RSA signing key', async () => {
      const metadata = await keyService.generateKey({
        purpose: 'DEVICE_CERTIFICATE',
        algorithm: {
          type: 'RSA',
          keySize: 2048
        },
        policy: {
          allowedOperations: ['SIGN', 'VERIFY', 'GET_PUBLIC_KEY'],
          allowedAlgorithms: ['RSA_PSS_SHA256'],
          exportPolicy: 'PUBLIC_ONLY'
        }
      });

      expect(metadata.id).toBeDefined();
      expect(metadata.algorithm).toBe('RSA-2048');
      expect(metadata.purpose).toBe('DEVICE_CERTIFICATE');
      expect(metadata.status).toBe('ACTIVE');
      expect(metadata.securityLevel).toBe('SOFTWARE');
    });

    it('should generate EC signing key', async () => {
      const metadata = await keyService.generateKey({
        purpose: 'JWT_SIGNING',
        algorithm: {
          type: 'EC',
          curve: 'P-256'
        },
        policy: {
          allowedOperations: ['SIGN', 'VERIFY'],
          allowedAlgorithms: ['ECDSA_SHA256'],
          exportPolicy: 'PUBLIC_ONLY'
        }
      });

      expect(metadata.algorithm).toBe('EC-P-256');
      expect(metadata.keyType).toBe('EC');
    });

    it('should generate AES encryption key', async () => {
      const metadata = await keyService.generateKey({
        purpose: 'RECORDING_KEK',
        algorithm: {
          type: 'AES',
          keySize: 256
        },
        policy: {
          allowedOperations: ['ENCRYPT', 'DECRYPT'],
          allowedAlgorithms: ['AES_256_GCM'],
          exportPolicy: 'NEVER'
        }
      });

      expect(metadata.algorithm).toBe('AES-256');
      expect(metadata.keySize).toBe(256);
    });
  });

  describe('Signing Operations', () => {
    it('should sign and verify data with EC key', async () => {
      // Generate key
      const keyMetadata = await keyService.generateKey({
        purpose: 'DEVICE_CERTIFICATE',
        algorithm: { type: 'EC', curve: 'P-256' },
        policy: {
          allowedOperations: ['SIGN', 'VERIFY', 'GET_PUBLIC_KEY'],
          allowedAlgorithms: ['ECDSA_SHA256'],
          exportPolicy: 'PUBLIC_ONLY'
        }
      });

      const keyRef = {
        id: keyMetadata.id,
        version: keyMetadata.version,
        provider: keyMetadata.provider,
        purpose: keyMetadata.purpose
      };

      const testData = Buffer.from('test certificate data');

      // Sign
      const signResult = await keyService.sign({
        key: keyRef,
        algorithm: 'ECDSA_SHA256',
        data: testData
      });

      expect(signResult.signature).toBeInstanceOf(Buffer);
      expect(signResult.signature.length).toBeGreaterThan(0);
      expect(signResult.keyId).toBe(keyMetadata.id);
      expect(signResult.provider).toBe('software-development');

      // Verify
      const verifyResult = await keyService.verify({
        key: keyRef,
        algorithm: 'ECDSA_SHA256',
        data: testData,
        signature: signResult.signature
      });

      expect(verifyResult.valid).toBe(true);
    });

    it('should detect invalid signature', async () => {
      const keyMetadata = await keyService.generateKey({
        purpose: 'DEVICE_CERTIFICATE',
        algorithm: { type: 'EC', curve: 'P-256' },
        policy: {
          allowedOperations: ['SIGN', 'VERIFY'],
          allowedAlgorithms: ['ECDSA_SHA256'],
          exportPolicy: 'PUBLIC_ONLY'
        }
      });

      const keyRef = {
        id: keyMetadata.id,
        version: keyMetadata.version,
        provider: keyMetadata.provider,
        purpose: keyMetadata.purpose
      };

      const testData = Buffer.from('test data');
      const invalidSignature = Buffer.from('invalid signature');

      const verifyResult = await keyService.verify({
        key: keyRef,
        algorithm: 'ECDSA_SHA256',
        data: testData,
        signature: invalidSignature
      });

      expect(verifyResult.valid).toBe(false);
    });
  });

  describe('Encryption Operations', () => {
    it('should encrypt and decrypt with RSA', async () => {
      const keyMetadata = await keyService.generateKey({
        purpose: 'CONFIG_ENCRYPTION',
        algorithm: { type: 'RSA', keySize: 2048 },
        policy: {
          allowedOperations: ['ENCRYPT', 'DECRYPT'],
          allowedAlgorithms: ['RSA_OAEP_SHA256'],
          exportPolicy: 'NEVER'
        }
      });

      const keyRef = {
        id: keyMetadata.id,
        version: keyMetadata.version,
        provider: keyMetadata.provider,
        purpose: keyMetadata.purpose
      };

      const plaintext = Buffer.from('secret configuration data');

      // Encrypt
      const encryptResult = await keyService.encrypt({
        key: keyRef,
        algorithm: 'RSA_OAEP_SHA256',
        plaintext
      });

      expect(encryptResult.ciphertext).toBeInstanceOf(Buffer);
      expect(encryptResult.ciphertext).not.toEqual(plaintext);

      // Decrypt
      const decryptResult = await keyService.decrypt({
        key: keyRef,
        algorithm: 'RSA_OAEP_SHA256',
        ciphertext: encryptResult.ciphertext
      });

      expect(decryptResult.plaintext).toEqual(plaintext);
    });

    it('should encrypt and decrypt with AES-GCM', async () => {
      const keyMetadata = await keyService.generateKey({
        purpose: 'DATABASE_ENCRYPTION',
        algorithm: { type: 'AES', keySize: 256 },
        policy: {
          allowedOperations: ['ENCRYPT', 'DECRYPT'],
          allowedAlgorithms: ['AES_256_GCM'],
          exportPolicy: 'NEVER'
        }
      });

      const keyRef = {
        id: keyMetadata.id,
        version: keyMetadata.version,
        provider: keyMetadata.provider,
        purpose: keyMetadata.purpose
      };

      const plaintext = Buffer.from('sensitive database field');

      // Encrypt
      const encryptResult = await keyService.encrypt({
        key: keyRef,
        algorithm: 'AES_256_GCM',
        plaintext
      });

      expect(encryptResult.ciphertext).toBeInstanceOf(Buffer);
      expect(encryptResult.iv).toBeInstanceOf(Buffer);
      expect(encryptResult.authTag).toBeInstanceOf(Buffer);

      // Decrypt
      const decryptResult = await keyService.decrypt({
        key: keyRef,
        algorithm: 'AES_256_GCM',
        ciphertext: encryptResult.ciphertext,
        iv: encryptResult.iv,
        authTag: encryptResult.authTag
      });

      expect(decryptResult.plaintext).toEqual(plaintext);
    });
  });

  describe('Policy Enforcement', () => {
    it('should block operation not in allowed operations', async () => {
      const keyMetadata = await keyService.generateKey({
        purpose: 'AUDIT_LOG_SIGNING',
        algorithm: { type: 'EC', curve: 'P-256' },
        policy: {
          allowedOperations: ['SIGN'], // Only SIGN allowed
          allowedAlgorithms: ['ECDSA_SHA256'],
          exportPolicy: 'PUBLIC_ONLY'
        }
      });

      const keyRef = {
        id: keyMetadata.id,
        version: keyMetadata.version,
        provider: keyMetadata.provider,
        purpose: keyMetadata.purpose
      };

      // Attempt VERIFY (not allowed)
      await expect(
        keyService.verify({
          key: keyRef,
          algorithm: 'ECDSA_SHA256',
          data: Buffer.from('test'),
          signature: Buffer.from('sig')
        })
      ).rejects.toThrow(KeyPolicyViolationError);
    });

    it('should block algorithm not in allowed algorithms', async () => {
      const keyMetadata = await keyService.generateKey({
        purpose: 'JWT_SIGNING',
        algorithm: { type: 'EC', curve: 'P-256' },
        policy: {
          allowedOperations: ['SIGN', 'VERIFY'],
          allowedAlgorithms: ['ECDSA_SHA256'], // Only SHA256
          exportPolicy: 'PUBLIC_ONLY'
        }
      });

      const keyRef = {
        id: keyMetadata.id,
        version: keyMetadata.version,
        provider: keyMetadata.provider,
        purpose: keyMetadata.purpose
      };

      // Attempt with SHA512 (not allowed)
      await expect(
        keyService.sign({
          key: keyRef,
          algorithm: 'ECDSA_SHA512',
          data: Buffer.from('test')
        })
      ).rejects.toThrow(KeyPolicyViolationError);
    });

    it('should enforce tenant isolation when configured', async () => {
      const keyMetadata = await keyService.generateKey({
        purpose: 'DEVICE_CERTIFICATE',
        algorithm: { type: 'EC', curve: 'P-256' },
        policy: {
          allowedOperations: ['SIGN'],
          allowedAlgorithms: ['ECDSA_SHA256'],
          exportPolicy: 'PUBLIC_ONLY',
          permittedTenants: ['tenant-123']
        },
        tenantId: 'tenant-123'
      });

      const keyRef = {
        id: keyMetadata.id,
        version: keyMetadata.version,
        provider: keyMetadata.provider,
        purpose: keyMetadata.purpose,
        tenantId: 'tenant-123'
      };

      // Allowed tenant
      const result = await keyService.sign({
        key: keyRef,
        algorithm: 'ECDSA_SHA256',
        data: Buffer.from('test'),
        context: { tenantId: 'tenant-123' }
      });

      expect(result.signature).toBeDefined();

      // Different tenant (blocked)
      await expect(
        keyService.sign({
          key: keyRef,
          algorithm: 'ECDSA_SHA256',
          data: Buffer.from('test'),
          context: { tenantId: 'tenant-456' }
        })
      ).rejects.toThrow();
    });
  });

  describe('Public Key Export', () => {
    it('should export public key in PEM format', async () => {
      const keyMetadata = await keyService.generateKey({
        purpose: 'DEVICE_CERTIFICATE',
        algorithm: { type: 'RSA', keySize: 2048 },
        policy: {
          allowedOperations: ['SIGN', 'GET_PUBLIC_KEY'],
          allowedAlgorithms: ['RSA_PSS_SHA256'],
          exportPolicy: 'PUBLIC_ONLY'
        }
      });

      const keyRef = {
        id: keyMetadata.id,
        version: keyMetadata.version,
        provider: keyMetadata.provider,
        purpose: keyMetadata.purpose
      };

      const result = await keyService.getPublicKey(keyRef, 'PEM');

      expect(result.publicKey).toBeInstanceOf(Buffer);
      expect(result.format).toBe('PEM');
      
      const pemString = result.publicKey.toString('utf-8');
      expect(pemString).toContain('BEGIN PUBLIC KEY');
      expect(pemString).toContain('END PUBLIC KEY');
    });
  });

  describe('Audit Trail', () => {
    it('should record successful operations', async () => {
      const keyMetadata = await keyService.generateKey({
        purpose: 'JWT_SIGNING',
        algorithm: { type: 'EC', curve: 'P-256' },
        policy: {
          allowedOperations: ['SIGN'],
          allowedAlgorithms: ['ECDSA_SHA256'],
          exportPolicy: 'PUBLIC_ONLY'
        }
      });

      const keyRef = {
        id: keyMetadata.id,
        version: keyMetadata.version,
        provider: keyMetadata.provider,
        purpose: keyMetadata.purpose
      };

      await keyService.sign({
        key: keyRef,
        algorithm: 'ECDSA_SHA256',
        data: Buffer.from('test'),
        context: {
          tenantId: 'tenant-123',
          service: 'test-service',
          actorId: 'test-user',
          correlationId: 'test-correlation-id'
        }
      });

      // Check audit logs
      const auditLogs = await audit.getKeyAuditLog(keyMetadata.id, { limit: 10 });
      
      expect(auditLogs.length).toBeGreaterThan(0);
      
      const signLog = auditLogs.find(log => log.operation === 'SIGN');
      expect(signLog).toBeDefined();
      expect(signLog?.success).toBe(true);
      expect(signLog?.tenantId).toBe('tenant-123');
      expect(signLog?.service).toBe('test-service');
      expect(signLog?.actorId).toBe('test-user');
    });

    it('should record failed operations', async () => {
      // Attempt operation on non-existent key
      const fakeKeyRef = {
        id: 'non-existent-key',
        version: 1,
        provider: 'software-development',
        purpose: 'JWT_SIGNING' as const
      };

      await expect(
        keyService.sign({
          key: fakeKeyRef,
          algorithm: 'ECDSA_SHA256',
          data: Buffer.from('test')
        })
      ).rejects.toThrow(KeyNotFoundError);

      // Should still be audited
      const auditLogs = await audit.getKeyAuditLog('non-existent-key', { limit: 10 });
      
      expect(auditLogs.length).toBeGreaterThan(0);
      expect(auditLogs[0].success).toBe(false);
      expect(auditLogs[0].errorCode).toBe('KEY_NOT_FOUND');
    });
  });

  describe('Provider Capabilities', () => {
    it('should report correct capabilities', () => {
      const capabilities = keyService.getCapabilities();

      expect(capabilities.securityLevel).toBe('SOFTWARE');
      expect(capabilities.operations.sign).toBe(true);
      expect(capabilities.operations.verify).toBe(true);
      expect(capabilities.operations.encrypt).toBe(true);
      expect(capabilities.operations.decrypt).toBe(true);
      expect(capabilities.privateKeyExportable).toBe(true);
      expect(capabilities.attestedHardware).toBe(false);
    });
  });

  describe('Health Check', () => {
    it('should report healthy status', async () => {
      const health = await keyService.healthCheck();

      expect(health.status).toBe('HEALTHY');
      expect(health.state).toBe('READY');
    });
  });
});
