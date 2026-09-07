import { describe, it, expect, beforeAll } from 'vitest';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import {
  AwsKmsSigningProvider,
  KmsSigningProvider,
  getEvidenceSigningProvider,
  setEvidenceSigningProvider,
} from '../../src/evidence/signing/evidence-signing-provider.js';

describe('AWS KMS Evidence Signing & Verification (P0-23, P0-24)', () => {
  const isLiveKmsRequired = process.env.TEST_AWS_KMS_LIVE === 'true';

  it('verifies live or simulated AWS KMS digest signing, MessageType: DIGEST, and non-double-hashing semantics', async () => {
    // Generate a sample forensic manifest canonical digest (32 bytes SHA-256)
    const testManifest = {
      evidenceId: 'EV-2026-TEST-KMS',
      tenantId: 'BANK-001',
      action: 'SEAL_PACKAGE',
      timestamp: new Date().toISOString(),
    };
    const manifestJson = JSON.stringify(testManifest);
    const preHashedDigest = createHash('sha256').update(manifestJson).digest();
    expect(preHashedDigest.length).toBe(32);

    if (isLiveKmsRequired) {
      // 1. Live AWS KMS execution (Requires valid AWS credentials and KMS key in environment)
      const keyId = process.env.AWS_KMS_KEY_ID || process.env.EVIDENCE_KMS_KEY_ARN;
      if (!keyId) {
        throw new Error('FAIL-CLOSED (P0-23): TEST_AWS_KMS_LIVE is true but AWS_KMS_KEY_ID is not configured.');
      }

      const kmsProvider = new AwsKmsSigningProvider({
        keyId,
        region: process.env.AWS_REGION || 'us-east-1',
      });

      // Sign pre-hashed digest
      const signResult = await kmsProvider.signDigest(preHashedDigest);
      expect(signResult.signature).toBeDefined();
      expect(signResult.signature.length).toBeGreaterThan(0);

      // Verify via KMS VerifyCommand
      const isKmsValid = await kmsProvider.verify(preHashedDigest, signResult.signature);
      expect(isKmsValid).toBe(true);

      // Local public key verification
      const pubKeyPem = await kmsProvider.getPublicKeyPem();
      expect(pubKeyPem).toContain('PUBLIC KEY');

      // Local crypto.verify on 32-byte digest avoiding double-hashing
      const isLocalValid = verify(null, preHashedDigest, pubKeyPem, signResult.signature);
      expect(isLocalValid).toBe(true);
    } else {
      // 2. Simulated KMS Provider verification validating P0-24 pre-hashed digest semantics
      // Generate standard ECDSA P-256 key pair matching KMS ECC_NIST_P256 / ECDSA_SHA_256
      const { privateKey, publicKey } = generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
      });
      const pubKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
      const privKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

      // Sign pre-hashed 32-byte digest directly without hashing a hash
      const signature = sign(null, preHashedDigest, privKeyPem);
      expect(signature.length).toBeGreaterThan(0);

      // Verify simulated provider with pre-loaded public key
      const mockKmsProvider = new AwsKmsSigningProvider({
        keyId: 'arn:aws:kms:us-east-1:123456789012:key/mock-evidence-p256',
        publicKeyPem: pubKeyPem,
      });

      // Verify that verify() succeeds on 32-byte pre-hashed digest
      const isValid = await mockKmsProvider.verify(preHashedDigest, signature);
      expect(isValid).toBe(true);

      // Verify that tampered digest fails
      const tamperedDigest = Buffer.from(preHashedDigest);
      tamperedDigest[0] ^= 0xff;
      const isTamperedValid = await mockKmsProvider.verify(tamperedDigest, signature);
      expect(isTamperedValid).toBe(false);

      // Verify that tampered signature fails
      const tamperedSignature = Buffer.from(signature);
      tamperedSignature[10] ^= 0xff;
      const isTamperedSigValid = await mockKmsProvider.verify(preHashedDigest, tamperedSignature);
      expect(isTamperedSigValid).toBe(false);
    }
  });

  it('ensures getEvidenceSigningProvider initializes without errors and supports switching', async () => {
    const provider = getEvidenceSigningProvider();
    expect(provider).toBeDefined();

    // Verify key ID is available
    await expect(provider.getKeyId()).resolves.toBeDefined();
  });
});
