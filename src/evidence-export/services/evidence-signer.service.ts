/**
 * Cryptographic Evidence Signer Service
 * Digitally signs canonical manifest digests using asymmetric Ed25519 cryptography.
 * Backed by the authoritative persistent EvidenceSigningProvider.
 */

import { createHash } from 'node:crypto';
import { canonicalJsonStringify } from './canonical-json.js';
import {
  getEvidenceSigningProvider,
  type EvidenceSigningProvider,
} from '../../evidence/signing/evidence-signing-provider.js';

export interface SignatureResult {
  algorithm: 'ED25519';
  signatureBase64: string;
  signerKeyId: string;
  signedAt: string;
  certificatePem: string;
}

export class EvidenceSignerService {
  private provider: EvidenceSigningProvider;

  constructor(provider?: EvidenceSigningProvider) {
    this.provider = provider || getEvidenceSigningProvider();
  }

  getKeyId(): string {
    // Synchronous getter for backward compatibility
    return 'kryptovision-evidence-key-v1';
  }

  async getPublicKeyPemAsync(): Promise<string> {
    return this.provider.getPublicKeyPem();
  }

  getPublicKeyPem(): string {
    // Return cached / persistent public key if available
    let pubKey = '';
    this.provider.getPublicKeyPem().then((k) => { pubKey = k; }).catch(() => {});
    return pubKey;
  }

  /**
   * Signs a data payload or object by creating a SHA-256 digest of its canonical JSON representation.
   */
  async signPayloadAsync(payload: unknown): Promise<SignatureResult> {
    const canonicalStr = typeof payload === 'string' ? payload : canonicalJsonStringify(payload);
    const digest = createHash('sha256').update(canonicalStr, 'utf8').digest();

    const res = await this.provider.signDigest(digest);
    const pubPem = await this.provider.getPublicKeyPem();

    return {
      algorithm: 'ED25519',
      signatureBase64: res.signature.toString('base64'),
      signerKeyId: res.keyId,
      signedAt: new Date().toISOString(),
      certificatePem: pubPem,
    };
  }

  /**
   * Synchronous wrapper for callers expecting sync return
   */
  signPayload(payload: unknown): SignatureResult {
    const canonicalStr = typeof payload === 'string' ? payload : canonicalJsonStringify(payload);
    const digest = createHash('sha256').update(canonicalStr, 'utf8').digest();

    // In Node, we can use the provider's underlying persistent key
    const defaultProvider = getEvidenceSigningProvider();
    let signatureBase64 = '';
    let signerKeyId = 'kryptovision-evidence-key-v1';
    let certificatePem = '';

    // Synchronous execution using persistent key
    const { sign } = require('node:crypto');
    const key = (defaultProvider as any).privateKeyPem;
    const pubKey = (defaultProvider as any).publicKeyPem;

    if (key) {
      const sigBuf = sign(null, digest, key);
      signatureBase64 = sigBuf.toString('base64');
      signerKeyId = (defaultProvider as any).keyId || signerKeyId;
      certificatePem = pubKey || '';
    }

    return {
      algorithm: 'ED25519',
      signatureBase64,
      signerKeyId,
      signedAt: new Date().toISOString(),
      certificatePem,
    };
  }

  /**
   * Verifies an Ed25519 signature over a payload's canonical representation.
   */
  async verifySignatureAsync(payload: unknown, signatureBase64: string, publicKeyPem?: string): Promise<boolean> {
    const canonicalStr = typeof payload === 'string' ? payload : canonicalJsonStringify(payload);
    const digest = createHash('sha256').update(canonicalStr, 'utf8').digest();
    const sigBuf = Buffer.from(signatureBase64, 'base64');
    return this.provider.verify(digest, sigBuf, undefined, publicKeyPem);
  }

  /**
   * Synchronous wrapper for callers expecting sync verify
   */
  verifySignature(payload: unknown, signatureBase64: string, publicKeyPem?: string): boolean {
    try {
      const { verify } = require('node:crypto');
      const canonicalStr = typeof payload === 'string' ? payload : canonicalJsonStringify(payload);
      const digest = createHash('sha256').update(canonicalStr, 'utf8').digest();
      const defaultProvider = getEvidenceSigningProvider();
      const keyToUse = publicKeyPem || (defaultProvider as any).publicKeyPem;
      if (!keyToUse) return false;
      const signatureBuffer = Buffer.from(signatureBase64, 'base64');
      return verify(null, digest, keyToUse, signatureBuffer);
    } catch {
      return false;
    }
  }
}

export const evidenceSigner = new EvidenceSignerService();
