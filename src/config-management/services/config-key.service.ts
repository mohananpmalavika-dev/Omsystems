import { generateKeyPairSync, sign, verify, createHash } from 'node:crypto';
import type { SignedConfigManifest, BranchConfiguration } from '../domain/signed-config.types.js';

export interface KeyProvider {
  getKeyId(): string;
  signData(data: Buffer): Buffer;
  verifyData(data: Buffer, signature: Buffer, keyId?: string): boolean;
  getPublicKeyPem(keyId?: string): string;
}

/**
 * Deterministic canonical JSON serialization.
 * Recursively sorts keys and serializes with stable whitespace and numeric precision.
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'number' || typeof obj === 'boolean') return JSON.stringify(obj);
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalJsonStringify(item)).join(',') + ']';
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const entries = keys.map(
      (key) => `${JSON.stringify(key)}:${canonicalJsonStringify((obj as Record<string, unknown>)[key])}`
    );
    return '{' + entries.join(',') + '}';
  }
  return JSON.stringify(obj);
}

/**
 * Computes deterministic SHA-256 hash of a configuration object.
 */
export function computeConfigHash(config: BranchConfiguration | Record<string, unknown>): string {
  const canonical = canonicalJsonStringify(config);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Software-backed Ed25519 Key Provider (Production HSM/PKCS11 Compatible)
 */
export class SoftwareEd25519KeyProvider implements KeyProvider {
  private keyId: string;
  private privateKeyPem: string;
  private publicKeyPem: string;
  private keyStore = new Map<string, { publicPem: string; privatePem?: string }>();

  constructor(keyId = 'config-signing-key-2026-03') {
    this.keyId = keyId;
    const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    this.privateKeyPem = privateKey;
    this.publicKeyPem = publicKey;
    this.keyStore.set(keyId, { publicPem: publicKey, privatePem: privateKey });
  }

  getKeyId(): string {
    return this.keyId;
  }

  signData(data: Buffer): Buffer {
    return sign(null, data, this.privateKeyPem);
  }

  verifyData(data: Buffer, signature: Buffer, keyId?: string): boolean {
    const targetKeyId = keyId || this.keyId;
    const keyEntry = this.keyStore.get(targetKeyId);
    if (!keyEntry) return false;
    try {
      return verify(null, data, keyEntry.publicPem, signature);
    } catch {
      return false;
    }
  }

  getPublicKeyPem(keyId?: string): string {
    const targetKeyId = keyId || this.keyId;
    return this.keyStore.get(targetKeyId)?.publicPem || this.publicKeyPem;
  }

  rotateKey(newKeyId: string): void {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    this.keyId = newKeyId;
    this.privateKeyPem = privateKey;
    this.publicKeyPem = publicKey;
    this.keyStore.set(newKeyId, { publicPem: publicKey, privatePem: privateKey });
  }
}

/**
 * Authoritative Configuration Signing & Verification Service
 */
export class ConfigKeyService {
  constructor(private readonly provider: KeyProvider = new SoftwareEd25519KeyProvider()) {}

  /**
   * Build and cryptographically sign a manifest for a versioned configuration.
   */
  signConfiguration(input: {
    packageId: string;
    tenantId: string;
    configVersion: number;
    schemaVersion: string;
    config: BranchConfiguration;
    scope?: { type: 'fleet' | 'branch' | 'cohort'; targetId?: string };
    previousVersion?: number;
    validityDays?: number;
  }): SignedConfigManifest {
    const now = new Date();
    const expiry = new Date(now.getTime() + (input.validityDays || 30) * 86400000);
    const configHash = computeConfigHash(input.config);
    const keyId = this.provider.getKeyId();

    const unsignedManifest: Omit<SignedConfigManifest, 'signature'> = {
      packageId: input.packageId,
      tenantId: input.tenantId,
      configVersion: input.configVersion,
      schemaVersion: input.schemaVersion,
      issuedAt: now.toISOString(),
      expiresAt: expiry.toISOString(),
      configHash,
      scope: input.scope || { type: 'fleet' },
      previousVersion: input.previousVersion,
      keyId,
      signatureAlgorithm: 'Ed25519',
    };

    const canonicalManifest = canonicalJsonStringify(unsignedManifest);
    const signatureBuffer = this.provider.signData(Buffer.from(canonicalManifest, 'utf8'));
    const signature = signatureBuffer.toString('base64');

    return {
      ...unsignedManifest,
      signature,
    };
  }

  /**
   * Verify digital signature and integrity of a manifest.
   */
  verifyManifest(manifest: SignedConfigManifest): {
    valid: boolean;
    reason?: string;
  } {
    if (!manifest.signature || !manifest.keyId) {
      return { valid: false, reason: 'Missing signature or keyId' };
    }

    // Check expiration
    const expiry = new Date(manifest.expiresAt);
    if (Date.now() > expiry.getTime()) {
      return { valid: false, reason: 'Configuration manifest has expired' };
    }

    const unsigned: Omit<SignedConfigManifest, 'signature'> = {
      packageId: manifest.packageId,
      tenantId: manifest.tenantId,
      configVersion: manifest.configVersion,
      schemaVersion: manifest.schemaVersion,
      issuedAt: manifest.issuedAt,
      expiresAt: manifest.expiresAt,
      configHash: manifest.configHash,
      scope: manifest.scope,
      previousVersion: manifest.previousVersion,
      keyId: manifest.keyId,
      signatureAlgorithm: manifest.signatureAlgorithm,
    };

    const canonical = canonicalJsonStringify(unsigned);
    const sigBuffer = Buffer.from(manifest.signature, 'base64');
    const isValid = this.provider.verifyData(Buffer.from(canonical, 'utf8'), sigBuffer, manifest.keyId);

    if (!isValid) {
      return { valid: false, reason: 'Cryptographic signature verification failed' };
    }

    return { valid: true };
  }

  /**
   * Full package verification: manifest signature AND configuration hash match.
   */
  verifyPackage(
    manifest: SignedConfigManifest,
    config: BranchConfiguration
  ): {
    valid: boolean;
    reason?: string;
  } {
    const manifestCheck = this.verifyManifest(manifest);
    if (!manifestCheck.valid) return manifestCheck;

    const actualHash = computeConfigHash(config);
    if (actualHash !== manifest.configHash) {
      return {
        valid: false,
        reason: `Configuration hash mismatch: manifest=${manifest.configHash}, actual=${actualHash}`,
      };
    }

    return { valid: true };
  }

  getActiveKeyId(): string {
    return this.provider.getKeyId();
  }

  getPublicKeyPem(keyId?: string): string {
    return this.provider.getPublicKeyPem(keyId);
  }
}

export const configKeyService = new ConfigKeyService();
