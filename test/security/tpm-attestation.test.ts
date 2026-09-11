import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  parseTpmsAttest,
  buildTpmsAttestBuffer,
  TpmQuoteParseError,
} from '../../src/security/attestation/crypto/tpms-attest.parser.js';
import {
  verifyTpmQuoteSignature,
  calculatePublicKeyFingerprint,
  validatePublicKeyStrength,
} from '../../src/security/attestation/crypto/tpm-signature.verifier.js';
import {
  computePcrCompositeDigest,
  verifyPcrDigest,
  PcrDigestVerificationError,
} from '../../src/security/attestation/crypto/pcr-digest.verifier.js';
import {
  TpmHashAlgorithm,
  TpmSignatureScheme,
  TpmState,
  SecureBootState,
  AttestationFailureReason,
} from '../../src/security/attestation/domain/attestation.types.js';
import { TpmAttestationService } from '../../src/security/attestation/application/tpm-attestation.service.js';
import {
  AttestationChallengeRecord,
  AttestationIdentityRecord,
  AttestationEvidenceRecord,
  PcrPolicyRecord,
  AttestationFleetStats,
} from '../../src/database/attestation-repository.js';

// In-Memory Repository for isolated unit testing
class MockAttestationRepository {
  challenges = new Map<string, AttestationChallengeRecord>();
  identities = new Map<string, AttestationIdentityRecord>();
  evidence = new Map<string, AttestationEvidenceRecord>();
  auditLog: any[] = [];

  async saveChallenge(c: AttestationChallengeRecord) {
    this.challenges.set(c.id, { ...c });
  }

  async getChallenge(id: string) {
    return this.challenges.get(id) || null;
  }

  async consumeChallenge(id: string) {
    const c = this.challenges.get(id);
    if (!c || c.consumedAt || c.expiresAt < new Date()) return false;
    c.consumedAt = new Date();
    return true;
  }

  async enrollIdentity(i: AttestationIdentityRecord) {
    this.identities.set(i.deviceId, { ...i });
  }

  async getIdentity(deviceId: string) {
    return this.identities.get(deviceId) || null;
  }

  async getIdentityByFingerprint(fp: string) {
    for (const id of this.identities.values()) {
      if (id.akPublicKeyFingerprint === fp) return id;
    }
    return null;
  }

  async revokeIdentity(deviceId: string, reason: string) {
    const i = this.identities.get(deviceId);
    if (!i) return false;
    i.trustLevel = 'REVOKED';
    i.revokedAt = new Date();
    i.revocationReason = reason;
    return true;
  }

  async updateIdentityStatus(deviceId: string, status: string, lastAttestedAt: Date) {
    const i = this.identities.get(deviceId);
    if (i) {
      i.lastAttestationStatus = status;
      i.lastAttestedAt = lastAttestedAt;
    }
  }

  async saveEvidence(e: AttestationEvidenceRecord) {
    this.evidence.set(e.id, { ...e });
  }

  async getLatestEvidence(deviceId: string) {
    let latest: AttestationEvidenceRecord | null = null;
    for (const e of this.evidence.values()) {
      if (e.deviceId === deviceId) {
        if (!latest || e.receivedAt > latest.receivedAt) latest = e;
      }
    }
    return latest;
  }

  async listEvidenceHistory(deviceId: string, limit = 20) {
    return Array.from(this.evidence.values())
      .filter((e) => e.deviceId === deviceId)
      .slice(0, limit);
  }

  async getBaselinePolicy(): Promise<PcrPolicyRecord | null> {
    return {
      id: 'policy_standard_uefi_v1',
      name: 'Standard UEFI Policy',
      platformType: 'linux_standard',
      expectedPcrs: { required_pcrs: [0, 2, 4, 7] },
      hashAlgorithm: 'sha256',
      isActive: true,
    };
  }

  async logAuditEvent(tenantId: string, deviceId: string, eventType: string, details: any) {
    this.auditLog.push({ tenantId, deviceId, eventType, details, timestamp: new Date() });
  }

  async getFleetStats(): Promise<AttestationFleetStats> {
    return {
      totalChallenges: this.challenges.size,
      activeChallenges: 0,
      totalSubmissions: this.evidence.size,
      verifiedCount: Array.from(this.evidence.values()).filter((e) => e.tpmState === 'ATTESTED').length,
      failedCount: 0,
      enrolledDevices: this.identities.size,
      revokedDevices: 0,
    };
  }
}

describe('TPM 2.0 Hardware Device Attestation (Zero-Mock Engine)', () => {
  // Generate real 2048-bit RSA key pair for testing
  const { publicKey: akPublicKeyPem, privateKey: akPrivateKeyPem } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const samplePcrs: Record<string, string> = {
    '0': 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
    '2': '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
    '4': 'f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f',
    '7': '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  };

  describe('TPMS_ATTEST Binary Parser', () => {
    it('accurately encodes and decodes a spec-compliant TPMS_ATTEST structure', () => {
      const nonce = crypto.randomBytes(32);
      const pcrSelection = { hashAlgorithm: TpmHashAlgorithm.SHA256, pcrs: [0, 2, 4, 7] };
      const pcrDigest = computePcrCompositeDigest(samplePcrs, pcrSelection);

      const quoteBuffer = buildTpmsAttestBuffer({
        extraData: nonce,
        pcrSelection,
        pcrDigest,
      });

      const parsed = parseTpmsAttest(quoteBuffer);
      expect(parsed.magic).toBe(0xff544347); // TPM_GENERATED_VALUE
      expect(parsed.type).toBe(0x8018); // TPM_ST_ATTEST_QUOTE
      expect(parsed.extraData.equals(nonce)).toBe(true);
      expect(parsed.attested.quote.pcrSelect.pcrs).toEqual([0, 2, 4, 7]);
      expect(parsed.attested.quote.pcrDigest.equals(pcrDigest)).toBe(true);
    });

    it('rejects invalid TPM magic value with TpmQuoteParseError', () => {
      const nonce = crypto.randomBytes(32);
      const pcrSelection = { hashAlgorithm: TpmHashAlgorithm.SHA256, pcrs: [0] };
      const pcrDigest = Buffer.alloc(32);

      const corruptBuffer = buildTpmsAttestBuffer({
        extraData: nonce,
        pcrSelection,
        pcrDigest,
      });
      corruptBuffer.writeUInt32BE(0x12345678, 0); // Corrupt magic

      expect(() => parseTpmsAttest(corruptBuffer)).toThrow(TpmQuoteParseError);
    });
  });

  describe('Multi-Scheme Signature Verifier', () => {
    it('verifies genuine RSASSA quote signatures and rejects altered quotes', () => {
      const quoteBytes = Buffer.from('TPM2_SPEC_TEST_QUOTE_BYTES_12345');
      const signer = crypto.createSign('sha256');
      signer.update(quoteBytes);
      signer.end();
      const signature = signer.sign(akPrivateKeyPem);

      // Valid signature
      const valid = verifyTpmQuoteSignature(
        quoteBytes,
        signature,
        akPublicKeyPem,
        TpmSignatureScheme.RSASSA,
        TpmHashAlgorithm.SHA256
      );
      expect(valid).toBe(true);

      // Altered quote bytes must fail verification
      const alteredBytes = Buffer.from('TPM2_SPEC_TEST_QUOTE_BYTES_TAMPERED');
      const tamperedValid = verifyTpmQuoteSignature(
        alteredBytes,
        signature,
        akPublicKeyPem,
        TpmSignatureScheme.RSASSA,
        TpmHashAlgorithm.SHA256
      );
      expect(tamperedValid).toBe(false);
    });

    it('calculates deterministic SHA-256 public key fingerprints', () => {
      const fp1 = calculatePublicKeyFingerprint(akPublicKeyPem);
      const fp2 = calculatePublicKeyFingerprint(akPublicKeyPem);
      expect(fp1).toHaveLength(64);
      expect(fp1).toBe(fp2);
    });

    it('rejects keys smaller than 2048 bits for production attestation security', () => {
      const { publicKey: weakPublicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 1024,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      });

      const strength = validatePublicKeyStrength(weakPublicKey);
      expect(strength.valid).toBe(false);
      expect(strength.reason).toContain('too weak');
    });
  });

  describe('PCR Composite Digest Calculation', () => {
    it('recomputes canonical composite digest in ascending index order', () => {
      const selection = { hashAlgorithm: TpmHashAlgorithm.SHA256, pcrs: [0, 2, 4, 7] };
      const digest = computePcrCompositeDigest(samplePcrs, selection);
      expect(digest).toHaveLength(32);

      // Verify timing-safe check passes
      expect(verifyPcrDigest(samplePcrs, digest, selection)).toBe(true);
    });

    it('detects single-bit PCR tampering with PcrDigestVerificationError', () => {
      const selection = { hashAlgorithm: TpmHashAlgorithm.SHA256, pcrs: [0, 2, 4, 7] };
      const originalDigest = computePcrCompositeDigest(samplePcrs, selection);

      // Tamper PCR 7
      const tamperedPcrs = {
        ...samplePcrs,
        '7': '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdee', // last byte altered
      };

      expect(() => verifyPcrDigest(tamperedPcrs, originalDigest, selection)).toThrow(
        PcrDigestVerificationError
      );
    });
  });

  describe('TpmAttestationService Pipeline & Replay Protection', () => {
    let repo: MockAttestationRepository;
    let service: TpmAttestationService;
    const tenantId = '00000000-0000-4000-8000-000000000000';
    const deviceId = 'edge_device_branch_01';

    beforeEach(async () => {
      repo = new MockAttestationRepository();
      service = new TpmAttestationService(repo as any);

      // Enroll device AK
      await service.enrollDeviceAk(tenantId, deviceId, 'edge-ak-01', akPublicKeyPem, {
        manufacturer: 'Infineon OPTIGA',
        firmwareVersion: '7.85.4554',
      });
    });

    it('successfully verifies genuine TPM hardware attestation evidence', async () => {
      // 1. Issue challenge
      const challenge = await service.issueChallenge(tenantId, deviceId, {
        requestedPcrs: [0, 2, 4, 7],
      });
      expect(challenge.nonce).toBeDefined();

      // 2. Hardware generates quote using challenge nonce
      const selection = { hashAlgorithm: TpmHashAlgorithm.SHA256, pcrs: [0, 2, 4, 7] };
      const pcrDigest = computePcrCompositeDigest(samplePcrs, selection);
      const quoteBuffer = buildTpmsAttestBuffer({
        extraData: Buffer.from(challenge.nonce, 'base64'),
        pcrSelection: selection,
        pcrDigest,
      });

      // Sign with AK
      const signer = crypto.createSign('sha256');
      signer.update(quoteBuffer);
      signer.end();
      const signatureBuffer = signer.sign(akPrivateKeyPem);

      // 3. Submit evidence
      const result = await service.submitEvidence(tenantId, deviceId, {
        challengeId: challenge.id,
        quote: quoteBuffer.toString('base64'),
        signature: signatureBuffer.toString('base64'),
        pcrValues: samplePcrs,
        secureBootReported: true,
      });

      expect(result.valid).toBe(true);
      expect(result.tpmState).toBe(TpmState.ATTESTED);
      expect(result.secureBootState).toBe(SecureBootState.VERIFIED);
      expect(result.nonceVerified).toBe(true);
      expect(result.quoteSignatureVerified).toBe(true);
      expect(result.pcrDigestVerified).toBe(true);
      expect(result.akTrusted).toBe(true);
    });

    it('prevents replay attacks by rejecting already-consumed challenges', async () => {
      // Issue challenge
      const challenge = await service.issueChallenge(tenantId, deviceId);
      const selection = { hashAlgorithm: TpmHashAlgorithm.SHA256, pcrs: [0, 2, 4, 7] };
      const pcrDigest = computePcrCompositeDigest(samplePcrs, selection);
      const quoteBuffer = buildTpmsAttestBuffer({
        extraData: Buffer.from(challenge.nonce, 'base64'),
        pcrSelection: selection,
        pcrDigest,
      });
      const signer = crypto.createSign('sha256');
      signer.update(quoteBuffer);
      signer.end();
      const signatureBuffer = signer.sign(akPrivateKeyPem);

      // First submission succeeds
      const first = await service.submitEvidence(tenantId, deviceId, {
        challengeId: challenge.id,
        quote: quoteBuffer.toString('base64'),
        signature: signatureBuffer.toString('base64'),
        pcrValues: samplePcrs,
      });
      expect(first.valid).toBe(true);

      // Second submission of the same challenge must be rejected (replay attack)
      const second = await service.submitEvidence(tenantId, deviceId, {
        challengeId: challenge.id,
        quote: quoteBuffer.toString('base64'),
        signature: signatureBuffer.toString('base64'),
        pcrValues: samplePcrs,
      });
      expect(second.valid).toBe(false);
      expect(second.failureReason).toBe(AttestationFailureReason.CHALLENGE_ALREADY_USED);
    });

    it('rejects quote when challenge nonce does not match quote extraData', async () => {
      const challenge = await service.issueChallenge(tenantId, deviceId);
      const fakeNonce = crypto.randomBytes(32); // Different nonce

      const selection = { hashAlgorithm: TpmHashAlgorithm.SHA256, pcrs: [0, 2, 4, 7] };
      const pcrDigest = computePcrCompositeDigest(samplePcrs, selection);
      const quoteBuffer = buildTpmsAttestBuffer({
        extraData: fakeNonce,
        pcrSelection: selection,
        pcrDigest,
      });
      const signer = crypto.createSign('sha256');
      signer.update(quoteBuffer);
      signer.end();
      const signatureBuffer = signer.sign(akPrivateKeyPem);

      const result = await service.submitEvidence(tenantId, deviceId, {
        challengeId: challenge.id,
        quote: quoteBuffer.toString('base64'),
        signature: signatureBuffer.toString('base64'),
        pcrValues: samplePcrs,
      });

      expect(result.valid).toBe(false);
      expect(result.failureReason).toBe(AttestationFailureReason.NONCE_MISMATCH);
      expect(result.tpmState).toBe(TpmState.COMPROMISED);
    });

    it('rejects quotes signed by revoked Attestation Keys', async () => {
      const challenge = await service.issueChallenge(tenantId, deviceId);
      await service.revokeDevice(deviceId, 'Hardware replacement');

      const selection = { hashAlgorithm: TpmHashAlgorithm.SHA256, pcrs: [0, 2, 4, 7] };
      const pcrDigest = computePcrCompositeDigest(samplePcrs, selection);
      const quoteBuffer = buildTpmsAttestBuffer({
        extraData: Buffer.from(challenge.nonce, 'base64'),
        pcrSelection: selection,
        pcrDigest,
      });
      const signer = crypto.createSign('sha256');
      signer.update(quoteBuffer);
      signer.end();
      const signatureBuffer = signer.sign(akPrivateKeyPem);

      const result = await service.submitEvidence(tenantId, deviceId, {
        challengeId: challenge.id,
        quote: quoteBuffer.toString('base64'),
        signature: signatureBuffer.toString('base64'),
        pcrValues: samplePcrs,
      });

      expect(result.valid).toBe(false);
      expect(result.failureReason).toBe(AttestationFailureReason.REVOKED_AK);
    });
  });
});
