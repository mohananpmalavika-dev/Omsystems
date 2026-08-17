/**
 * Cryptographic Evidence Signer Service
 * Digitally signs canonical manifest digests using asymmetric Ed25519 cryptography.
 */

import { generateKeyPairSync, sign, verify, createHash } from 'node:crypto';
import { canonicalJsonStringify } from './canonical-json.js';

export interface SignatureResult {
  algorithm: 'ED25519';
  signatureBase64: string;
  signerKeyId: string;
  signedAt: string;
  certificatePem: string;
}

export class EvidenceSignerService {
  private privateKey: string;
  private publicKey: string;
  private keyId: string = 'evidence-signing-key-2026-v1';

  constructor() {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    this.privateKey = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    this.publicKey = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  }

  getKeyId(): string {
    return this.keyId;
  }

  getPublicKeyPem(): string {
    return this.publicKey;
  }

  /**
   * Signs a data payload or object by creating a SHA-256 digest of its canonical JSON representation.
   */
  signPayload(payload: unknown): SignatureResult {
    const canonicalStr = typeof payload === 'string' ? payload : canonicalJsonStringify(payload);
    const digest = createHash('sha256').update(canonicalStr, 'utf8').digest();

    const signatureBuffer = sign(null, digest, this.privateKey);
    const signatureBase64 = signatureBuffer.toString('base64');

    return {
      algorithm: 'ED25519',
      signatureBase64,
      signerKeyId: this.keyId,
      signedAt: new Date().toISOString(),
      certificatePem: this.publicKey,
    };
  }

  /**
   * Verifies an Ed25519 signature over a payload's canonical representation.
   */
  verifySignature(payload: unknown, signatureBase64: string, publicKeyPem?: string): boolean {
    try {
      const keyToUse = publicKeyPem || this.publicKey;
      const canonicalStr = typeof payload === 'string' ? payload : canonicalJsonStringify(payload);
      const digest = createHash('sha256').update(canonicalStr, 'utf8').digest();
      const signatureBuffer = Buffer.from(signatureBase64, 'base64');

      return verify(null, digest, keyToUse, signatureBuffer);
    } catch {
      return false;
    }
  }
}

export const evidenceSigner = new EvidenceSignerService();
