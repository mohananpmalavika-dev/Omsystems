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
  if (obj === null) return 'null';
  if (obj === undefined || typeof obj === 'function' || typeof obj === 'symbol' || typeof obj === 'bigint') {
    throw new Error('config_canonicalization_unsupported_value');
  }
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) throw new Error('config_canonicalization_non_finite_number');
    return JSON.stringify(obj);
  }
  if (typeof obj === 'boolean') return JSON.stringify(obj);
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => item === undefined ? 'null' : canonicalJsonStringify(item)).join(',') + ']';
  }
  if (typeof obj === 'object') {
    // Optional configuration fields are omitted by JSON serialization. Keep
    // that stable behavior while rejecting unsupported values when present.
    const keys = Object.keys(obj as Record<string, unknown>)
      .filter((key) => (obj as Record<string, unknown>)[key] !== undefined)
      .sort();
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

  constructor(keyId = process.env.CONFIG_SIGNING_KEY_ID || 'config-signing-key-2026-03') {
    const configuredPrivateKey = process.env.CONFIG_SIGNING_PRIVATE_KEY?.replaceAll('\\n', '\n').trim();
    const configuredPublicKey = process.env.CONFIG_SIGNING_PUBLIC_KEY?.replaceAll('\\n', '\n').trim();
    if (process.env.NODE_ENV === 'production' && (!configuredPrivateKey || !configuredPublicKey)) {
      throw new Error('config_signing_key_not_configured');
    }
    this.keyId = keyId;
    if (configuredPrivateKey && configuredPublicKey) {
      this.privateKeyPem = configuredPrivateKey;
      this.publicKeyPem = configuredPublicKey;
    } else {
      const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      this.privateKeyPem = privateKey;
      this.publicKeyPem = publicKey;
    }
    this.keyStore.set(keyId, { publicPem: this.publicKeyPem, privatePem: this.privateKeyPem });
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
    const structuralError = validateManifestShape(manifest);
    if (structuralError) return { valid: false, reason: structuralError };

    // Check expiration
    const issuedAt = Date.parse(manifest.issuedAt);
    const expiry = Date.parse(manifest.expiresAt);
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiry) || expiry <= issuedAt) {
      return { valid: false, reason: 'Configuration manifest timestamps are invalid' };
    }
    if (Date.now() > expiry) {
      return { valid: false, reason: 'Configuration manifest has expired' };
    }
    if (issuedAt > Date.now() + 5 * 60_000 || expiry - issuedAt > 31 * 86400_000) {
      return { valid: false, reason: 'Configuration manifest validity window is invalid' };
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

    let isValid = false;
    try {
      const canonical = canonicalJsonStringify(unsigned);
      const sigBuffer = decodeEd25519Signature(manifest.signature);
      isValid = this.provider.verifyData(Buffer.from(canonical, 'utf8'), sigBuffer, manifest.keyId);
    } catch {
      return { valid: false, reason: 'Configuration manifest encoding is invalid' };
    }

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

function validateManifestShape(manifest: SignedConfigManifest): string | undefined {
  if (!manifest || manifest.signatureAlgorithm !== 'Ed25519' || !manifest.signature || !manifest.keyId) {
    return 'Missing or unsupported configuration signature metadata';
  }
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(manifest.keyId) ||
      !/^[A-Za-z0-9._:-]{1,160}$/.test(manifest.packageId) ||
      !/^[A-Za-z0-9._:-]{1,160}$/.test(manifest.tenantId) ||
      !Number.isSafeInteger(manifest.configVersion) || manifest.configVersion < 1 ||
      typeof manifest.schemaVersion !== 'string' || manifest.schemaVersion.length > 64 ||
      !/^[a-f0-9]{64}$/i.test(manifest.configHash) ||
      !manifest.scope || !['fleet', 'branch', 'cohort'].includes(manifest.scope.type) ||
      (manifest.scope.targetId !== undefined && !/^[A-Za-z0-9._:-]{1,160}$/.test(manifest.scope.targetId))) {
    return 'Configuration manifest fields are invalid';
  }
  return undefined;
}

function decodeEd25519Signature(signature: string): Buffer {
  // Standard base64 Ed25519 signatures are always 88 characters (64 bytes
  // plus canonical padding). Buffer.from is permissive, so validate first.
  if (!/^[A-Za-z0-9+/]{86}==$/.test(signature)) throw new Error('config_signature_encoding_invalid');
  const decoded = Buffer.from(signature, 'base64');
  if (decoded.length !== 64 || decoded.toString('base64') !== signature) {
    throw new Error('config_signature_encoding_invalid');
  }
  return decoded;
}

export const configKeyService = new ConfigKeyService();
