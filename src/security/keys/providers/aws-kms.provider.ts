/**
 * AWS KMS Key Provider
 * 
 * Hardware-backed key management using AWS Key Management Service (KMS)
 * Private key material never leaves the AWS KMS HSM boundary (FIPS 140-2 Level 3).
 */

import {
  KMSClient,
  SignCommand,
  VerifyCommand,
  EncryptCommand,
  DecryptCommand,
  GetPublicKeyCommand,
  CreateKeyCommand,
  ScheduleKeyDeletionCommand,
  DescribeKeyCommand,
} from '@aws-sdk/client-kms';
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
  AWSKMSProviderConfig,
  SigningAlgorithm,
  EncryptionAlgorithm,
} from '../types.js';
import {
  KeyNotFoundError,
  UnsupportedAlgorithmError,
  InitializationFailedError,
} from '../errors.js';

export class AWSKMSProvider implements KeyProvider {
  private client: KMSClient | null = null;
  private initialized: boolean = false;
  private config: AWSKMSProviderConfig;

  constructor(config: AWSKMSProviderConfig) {
    this.config = config;
  }

  getName(): string {
    return 'aws-kms';
  }

  async initialize(): Promise<void> {
    try {
      this.client = new KMSClient({
        region: this.config.region,
        endpoint: this.config.endpoint,
      });

      if (this.config.keyAliases && Object.keys(this.config.keyAliases).length > 0) {
        const firstKeyId = Object.values(this.config.keyAliases)[0];
        try {
          await this.client.send(new DescribeKeyCommand({ KeyId: firstKeyId }));
        } catch {
          // If alias not found or network error, non-fatal for startup
        }
      }

      this.initialized = true;
    } catch (error: any) {
      throw new InitializationFailedError(
        'aws-kms',
        `Failed to initialize AWS KMS provider: ${error?.message || String(error)}`,
        error
      );
    }
  }

  private assertInitialized(): KMSClient {
    if (!this.initialized || !this.client) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }
    return this.client;
  }

  getCapabilities(): KeyProviderCapabilities {
    return {
      securityLevel: 'REMOTE_HARDWARE_BACKED',
      operations: {
        sign: true,
        verify: true,
        encrypt: true,
        decrypt: true,
        generateKey: true,
        destroyKey: true,
        getPublicKey: true,
        wrapKey: false,
        unwrapKey: false,
      },
      keyTypes: {
        rsa: true,
        ec: true,
        aes: true,
      },
      signingAlgorithms: [
        'RSA_PSS_SHA256',
        'RSA_PKCS1_SHA256',
        'ECDSA_SHA256',
        'ECDSA_SHA384',
      ],
      encryptionAlgorithms: [
        'RSA_OAEP_SHA256',
        'AES_256_GCM',
      ],
      privateKeyExportable: false,
      attestedHardware: true,
      fipsMode: true,
      metadata: {
        region: this.config.region,
        endpoint: this.config.endpoint,
      },
    };
  }

  private mapSigningAlgorithmToAWS(alg: SigningAlgorithm): string {
    switch (alg) {
      case 'RSA_PSS_SHA256':
        return 'RSASSA_PSS_SHA_256';
      case 'RSA_PKCS1_SHA256':
        return 'RSASSA_PKCS1_V1_5_SHA_256';
      case 'ECDSA_SHA256':
        return 'ECDSA_SHA_256';
      case 'ECDSA_SHA384':
        return 'ECDSA_SHA_384';
      default:
        throw new UnsupportedAlgorithmError(this.getName(), alg, 'Signing');
    }
  }

  private mapEncryptionAlgorithmToAWS(alg: EncryptionAlgorithm): string {
    switch (alg) {
      case 'RSA_OAEP_SHA256':
        return 'RSAES_OAEP_SHA_256';
      default:
        throw new UnsupportedAlgorithmError(this.getName(), alg, 'Encryption');
    }
  }

  async sign(request: SignRequest): Promise<SignatureResult> {
    const client = this.assertInitialized();
    const signingAlgorithm = this.mapSigningAlgorithmToAWS(request.algorithm);

    const response = await client.send(
      new SignCommand({
        KeyId: request.key.id,
        Message: request.data,
        MessageType: 'RAW',
        SigningAlgorithm: signingAlgorithm as any,
      })
    );

    return {
      signature: Buffer.from(response.Signature || new Uint8Array(0)),
      algorithm: request.algorithm,
      keyId: request.key.id,
      keyVersion: request.key.version,
      provider: this.getName(),
      timestamp: new Date(),
    };
  }

  async verify(request: VerifyRequest): Promise<VerificationResult> {
    const client = this.assertInitialized();
    const signingAlgorithm = this.mapSigningAlgorithmToAWS(request.algorithm);

    try {
      const response = await client.send(
        new VerifyCommand({
          KeyId: request.key.id,
          Message: request.data,
          MessageType: 'RAW',
          Signature: request.signature,
          SigningAlgorithm: signingAlgorithm as any,
        })
      );

      return {
        valid: response.SignatureValid ?? false,
        algorithm: request.algorithm,
        keyId: request.key.id,
        keyVersion: request.key.version,
        provider: this.getName(),
        timestamp: new Date(),
      };
    } catch {
      return {
        valid: false,
        algorithm: request.algorithm,
        keyId: request.key.id,
        keyVersion: request.key.version,
        provider: this.getName(),
        timestamp: new Date(),
      };
    }
  }

  async encrypt(request: EncryptRequest): Promise<EncryptionResult> {
    const client = this.assertInitialized();
    const encryptionAlgorithm = this.mapEncryptionAlgorithmToAWS(request.algorithm);

    const response = await client.send(
      new EncryptCommand({
        KeyId: request.key.id,
        Plaintext: request.plaintext,
        EncryptionAlgorithm: encryptionAlgorithm as any,
      })
    );

    return {
      ciphertext: Buffer.from(response.CiphertextBlob || new Uint8Array(0)),
      iv: Buffer.alloc(0),
      algorithm: request.algorithm,
      keyId: request.key.id,
      keyVersion: request.key.version,
      provider: this.getName(),
      timestamp: new Date(),
    };
  }

  async decrypt(request: DecryptRequest): Promise<DecryptionResult> {
    const client = this.assertInitialized();
    const encryptionAlgorithm = this.mapEncryptionAlgorithmToAWS(request.algorithm);

    const response = await client.send(
      new DecryptCommand({
        KeyId: request.key.id,
        CiphertextBlob: request.ciphertext,
        EncryptionAlgorithm: encryptionAlgorithm as any,
      })
    );

    return {
      plaintext: Buffer.from(response.Plaintext || new Uint8Array(0)),
      algorithm: request.algorithm,
      keyId: request.key.id,
      keyVersion: request.key.version,
      provider: this.getName(),
      timestamp: new Date(),
    };
  }

  async generateKey(request: GenerateKeyRequest): Promise<KeyMetadata> {
    const client = this.assertInitialized();

    let keySpec: string = 'SYMMETRIC_DEFAULT';
    let keyUsage: string = 'ENCRYPT_DECRYPT';

    if (request.purpose === 'AUDIT_LOG_SIGNING' || request.purpose === 'JWT_SIGNING' || request.purpose === 'ROOT_CA' || request.purpose === 'INTERMEDIATE_CA') {
      keySpec = 'RSA_2048';
      keyUsage = 'SIGN_VERIFY';
    }

    const response = await client.send(
      new CreateKeyCommand({
        Description: `KryptoVision ${request.purpose} Key`,
        KeyUsage: keyUsage as any,
        KeySpec: keySpec as any,
      })
    );

    const metadata = response.KeyMetadata;
    const keyId = metadata?.KeyId || `arn:aws:kms:${this.config.region}:${Date.now()}:key/auto`;

    return {
      id: keyId,
      provider: this.getName(),
      externalKeyId: keyId,
      purpose: request.purpose,
      algorithm: request.algorithm.type === 'RSA' ? 'RSA_2048' : 'AES_256',
      keyType: request.algorithm.type,
      keySize: request.algorithm.keySize || (request.algorithm.type === 'RSA' ? 2048 : 256),
      version: 1,
      securityLevel: 'REMOTE_HARDWARE_BACKED',
      status: 'ACTIVE',
      policy: request.policy,
      createdAt: metadata?.CreationDate || new Date(),
      tenantId: request.tenantId,
      metadata: request.metadata,
    };
  }

  async destroyKey(keyRef: KeyReference): Promise<void> {
    const client = this.assertInitialized();
    await client.send(
      new ScheduleKeyDeletionCommand({
        KeyId: keyRef.id,
        PendingWindowInDays: 7,
      })
    );
  }

  async getPublicKey(keyRef: KeyReference, format: 'PEM' | 'DER' | 'JWK' = 'DER'): Promise<PublicKeyResult> {
    const client = this.assertInitialized();
    try {
      const response = await client.send(
        new GetPublicKeyCommand({
          KeyId: keyRef.id,
        })
      );

      return {
        publicKey: Buffer.from(response.PublicKey || new Uint8Array(0)),
        format,
        keyId: keyRef.id,
        algorithm: (response.KeySpec as any) || 'RSA_2048',
      };
    } catch (error: any) {
      throw new KeyNotFoundError(this.getName(), keyRef.id, error?.message || 'Key not found');
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.initialized || !this.client) {
      return {
        status: 'UNAVAILABLE',
        state: 'UNINITIALIZED',
        checkedAt: new Date(),
        reason: 'Provider not initialized',
      };
    }

    return {
      status: 'HEALTHY',
      state: 'READY',
      checkedAt: new Date(),
      details: {
        region: this.config.region,
      },
    };
  }

  async shutdown(): Promise<void> {
    this.client = null;
    this.initialized = false;
  }
}
