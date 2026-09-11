/**
 * TPM 2.0 Attestation Service
 * Production remote attestation orchestrator backed by PostgreSQL and native cryptography
 */

import crypto from 'crypto';
import {
  TpmState,
  SecureBootState,
  AttestationFailureReason,
  TpmHashAlgorithm,
  TpmSignatureScheme,
  TpmAttestationSubmission,
  TpmQuoteVerificationResult,
} from '../domain/attestation.types.js';
import { parseTpmsAttest } from '../crypto/tpms-attest.parser.js';
import {
  verifyTpmQuoteSignature,
  calculatePublicKeyFingerprint,
  validatePublicKeyStrength,
} from '../crypto/tpm-signature.verifier.js';
import { verifyPcrDigest } from '../crypto/pcr-digest.verifier.js';
import {
  AttestationRepository,
  AttestationChallengeRecord,
  AttestationIdentityRecord,
  AttestationEvidenceRecord,
} from '../../../database/attestation-repository.js';

export class TpmAttestationService {
  constructor(private readonly repository: AttestationRepository) {}

  /**
   * Issue a cryptographic anti-replay challenge with CSPRNG nonce and 120s TTL
   */
  async issueChallenge(
    tenantId: string,
    deviceId: string,
    options?: { requestedPcrs?: number[]; hashAlgorithm?: string; ttlSeconds?: number }
  ): Promise<AttestationChallengeRecord> {
    const nonce = crypto.randomBytes(32).toString('base64');
    const challengeId = `chal_${crypto.randomBytes(16).toString('hex')}`;
    const ttl = options?.ttlSeconds ?? 120;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl * 1000);

    const challenge: AttestationChallengeRecord = {
      id: challengeId,
      tenantId,
      deviceId,
      nonce,
      requestedPcrs: options?.requestedPcrs ?? [0, 2, 4, 7],
      hashAlgorithm: options?.hashAlgorithm ?? 'sha256',
      createdAt: now,
      expiresAt,
    };

    await this.repository.saveChallenge(challenge);
    await this.repository.logAuditEvent(tenantId, deviceId, 'CHALLENGE_ISSUED', {
      challengeId,
      requestedPcrs: challenge.requestedPcrs,
      expiresAt,
    });

    return challenge;
  }

  /**
   * Enroll a hardware Attestation Key (AK) with key-strength validation and SHA-256 fingerprinting
   */
  async enrollDeviceAk(
    tenantId: string,
    deviceId: string,
    akName: string,
    akPublicKeyPem: string,
    tpmMetadata?: {
      endorsementKeyFingerprint?: string;
      manufacturer?: string;
      firmwareVersion?: string;
    }
  ): Promise<AttestationIdentityRecord> {
    const strength = validatePublicKeyStrength(akPublicKeyPem);
    if (!strength.valid) {
      throw new Error(`Invalid Attestation Key: ${strength.reason}`);
    }

    const fingerprint = calculatePublicKeyFingerprint(akPublicKeyPem);
    const identityId = `ak_${crypto.randomBytes(16).toString('hex')}`;

    const identity: AttestationIdentityRecord = {
      id: identityId,
      tenantId,
      deviceId,
      akName,
      akPublicKeyFingerprint: fingerprint,
      akPublicKeyPem,
      endorsementKeyFingerprint: tpmMetadata?.endorsementKeyFingerprint ?? null,
      manufacturer: tpmMetadata?.manufacturer ?? null,
      firmwareVersion: tpmMetadata?.firmwareVersion ?? null,
      trustLevel: 'ENROLLED',
      enrolledAt: new Date(),
    };

    await this.repository.enrollIdentity(identity);
    await this.repository.logAuditEvent(tenantId, deviceId, 'AK_ENROLLED', {
      akName,
      fingerprint,
      manufacturer: tpmMetadata?.manufacturer,
      firmwareVersion: tpmMetadata?.firmwareVersion,
    });

    return identity;
  }

  /**
   * Execute the end-to-end cryptographic verification pipeline
   */
  async submitEvidence(
    tenantId: string,
    deviceId: string,
    submission: TpmAttestationSubmission
  ): Promise<TpmQuoteVerificationResult> {
    const now = new Date();
    const evidenceId = `ev_${crypto.randomBytes(16).toString('hex')}`;

    const result: TpmQuoteVerificationResult = {
      valid: false,
      structureValid: false,
      nonceVerified: false,
      quoteSignatureVerified: false,
      pcrDigestVerified: false,
      akTrusted: false,
      pcrSelectionVerified: false,
      policyMatched: false,
      tpmState: TpmState.FAILED,
      secureBootState: SecureBootState.UNKNOWN,
      evidenceId,
      challengeId: submission.challengeId,
    };

    let failureReason: AttestationFailureReason | string | undefined;

    // Step 1: Validate challenge existence, recipient, and expiration
    const challenge = await this.repository.getChallenge(submission.challengeId);
    if (!challenge) {
      result.failureReason = AttestationFailureReason.CHALLENGE_NOT_FOUND;
      return result;
    }

    if (challenge.deviceId !== deviceId || challenge.tenantId !== tenantId) {
      result.failureReason = AttestationFailureReason.NONCE_MISMATCH;
      return result;
    }

    if (challenge.expiresAt < now) {
      result.failureReason = AttestationFailureReason.CHALLENGE_EXPIRED;
      return result;
    }

    if (challenge.consumedAt) {
      result.failureReason = AttestationFailureReason.CHALLENGE_ALREADY_USED;
      return result;
    }

    // Step 2: Atomically consume challenge to prevent replay attacks
    const consumed = await this.repository.consumeChallenge(submission.challengeId);
    if (!consumed) {
      result.failureReason = AttestationFailureReason.CHALLENGE_ALREADY_USED;
      return result;
    }

    // Step 3: Validate device identity (Enrolled Attestation Key)
    const identity = await this.repository.getIdentity(deviceId, tenantId);
    if (!identity) {
      result.failureReason = AttestationFailureReason.UNTRUSTED_AK;
      await this.persistEvidence(tenantId, deviceId, submission, result, now, 'UNTRUSTED_AK: No enrolled AK');
      return result;
    }

    if (identity.trustLevel === 'REVOKED' || identity.revokedAt) {
      result.failureReason = AttestationFailureReason.REVOKED_AK;
      await this.persistEvidence(tenantId, deviceId, submission, result, now, 'REVOKED_AK');
      return result;
    }

    result.akTrusted = true;

    // Step 4: Parse TPMS_ATTEST binary quote structure
    let quoteBuffer: Buffer;
    let signatureBuffer: Buffer;
    try {
      quoteBuffer = Buffer.from(submission.quote, 'base64');
      signatureBuffer = Buffer.from(submission.signature, 'base64');
    } catch {
      result.failureReason = AttestationFailureReason.INVALID_PAYLOAD_STRUCTURE;
      await this.persistEvidence(tenantId, deviceId, submission, result, now, 'Invalid base64 encoding');
      return result;
    }

    let parsedQuote: ReturnType<typeof parseTpmsAttest>;
    try {
      parsedQuote = parseTpmsAttest(quoteBuffer);
      result.structureValid = true;
      result.parsedQuote = parsedQuote;
    } catch (parseError) {
      result.failureReason = AttestationFailureReason.INVALID_PAYLOAD_STRUCTURE;
      await this.persistEvidence(
        tenantId,
        deviceId,
        submission,
        result,
        now,
        `Structure parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`
      );
      return result;
    }

    // Step 5: Verify challenge nonce against quote extraData (timing-safe)
    const expectedNonceBuffer = Buffer.from(challenge.nonce, 'base64');
    if (
      parsedQuote.extraData.length !== expectedNonceBuffer.length ||
      !crypto.timingSafeEqual(parsedQuote.extraData, expectedNonceBuffer)
    ) {
      result.failureReason = AttestationFailureReason.NONCE_MISMATCH;
      result.tpmState = TpmState.COMPROMISED;
      await this.persistEvidence(tenantId, deviceId, submission, result, now, 'Nonce mismatch');
      return result;
    }
    result.nonceVerified = true;

    // Step 6: Verify AK signature over quote bytes
    const scheme = TpmSignatureScheme.RSASSA;
    const isSignatureValid = verifyTpmQuoteSignature(
      parsedQuote.rawBytes,
      signatureBuffer,
      identity.akPublicKeyPem,
      scheme,
      parsedQuote.attested.quote.pcrSelect.hashAlgorithm
    );

    if (!isSignatureValid) {
      result.failureReason = AttestationFailureReason.SIGNATURE_VERIFICATION_FAILED;
      result.tpmState = TpmState.COMPROMISED;
      await this.persistEvidence(tenantId, deviceId, submission, result, now, 'Quote signature verification failed');
      return result;
    }
    result.quoteSignatureVerified = true;

    // Step 7: Verify PCR selection matches requested challenge
    const quotedPcrs = parsedQuote.attested.quote.pcrSelect.pcrs;
    const requestedPcrs = challenge.requestedPcrs;
    const hasAllRequestedPcrs = requestedPcrs.every((pcr) => quotedPcrs.includes(pcr));

    if (!hasAllRequestedPcrs) {
      result.failureReason = AttestationFailureReason.PCR_SELECTION_MISMATCH;
      await this.persistEvidence(tenantId, deviceId, submission, result, now, 'Quoted PCRs do not match challenge');
      return result;
    }
    result.pcrSelectionVerified = true;

    // Step 8: Recompute composite PCR digest & timing-safe compare against hardware quote
    try {
      verifyPcrDigest(
        submission.pcrValues,
        parsedQuote.attested.quote.pcrDigest,
        parsedQuote.attested.quote.pcrSelect
      );
      result.pcrDigestVerified = true;
    } catch (digestError) {
      result.failureReason = AttestationFailureReason.PCR_DIGEST_MISMATCH;
      result.tpmState = TpmState.COMPROMISED;
      await this.persistEvidence(
        tenantId,
        deviceId,
        submission,
        result,
        now,
        `PCR digest mismatch: ${digestError instanceof Error ? digestError.message : String(digestError)}`
      );
      return result;
    }

    // Step 9: Evaluate baseline policy
    const policy = await this.repository.getBaselinePolicy('linux_standard');
    if (policy && policy.expectedPcrs.required_pcrs) {
      const allRequired = policy.expectedPcrs.required_pcrs.every(
        (pcr) => submission.pcrValues[pcr.toString()] !== undefined
      );
      result.policyMatched = allRequired;
    } else {
      result.policyMatched = true;
    }

    // Step 10: Determine Secure Boot status
    const hasSecureBootPcr = submission.pcrValues['7'] !== undefined;
    if (submission.secureBootReported !== false && hasSecureBootPcr && result.pcrDigestVerified) {
      result.secureBootState = SecureBootState.VERIFIED;
    } else if (submission.secureBootReported === true) {
      result.secureBootState = SecureBootState.ENABLED_REPORTED;
    } else {
      result.secureBootState = SecureBootState.UNKNOWN;
    }

    // All checks passed!
    result.valid = true;
    result.tpmState = TpmState.ATTESTED;

    await this.persistEvidence(tenantId, deviceId, submission, result, now);
    await this.repository.updateIdentityStatus(deviceId, TpmState.ATTESTED, now);
    await this.repository.logAuditEvent(tenantId, deviceId, 'ATTESTATION_VERIFIED', {
      evidenceId,
      tpmState: result.tpmState,
      secureBootState: result.secureBootState,
    });

    return result;
  }

  private async persistEvidence(
    tenantId: string,
    deviceId: string,
    submission: TpmAttestationSubmission,
    result: TpmQuoteVerificationResult,
    receivedAt: Date,
    failureReasonOverride?: string
  ): Promise<void> {
    const evidence: AttestationEvidenceRecord = {
      id: result.evidenceId || `ev_${crypto.randomBytes(16).toString('hex')}`,
      tenantId,
      deviceId,
      challengeId: submission.challengeId,
      quote: submission.quote,
      signature: submission.signature,
      pcrValues: submission.pcrValues,
      pcrSelection: result.parsedQuote?.attested.quote.pcrSelect || {
        hashAlgorithm: 'sha256',
        pcrs: Object.keys(submission.pcrValues).map(Number),
      },
      pcrDigest: result.parsedQuote?.attested.quote.pcrDigest.toString('hex') || '',
      structureValid: result.structureValid,
      nonceVerified: result.nonceVerified,
      signatureVerified: result.quoteSignatureVerified,
      pcrDigestVerified: result.pcrDigestVerified,
      akTrusted: result.akTrusted,
      policyMatched: result.policyMatched,
      tpmState: result.tpmState,
      secureBootState: result.secureBootState,
      failureReason: failureReasonOverride || (result.failureReason as string) || null,
      receivedAt,
      verifiedAt: result.valid ? new Date() : null,
    };

    await this.repository.saveEvidence(evidence);
  }

  async getDeviceStatus(deviceId: string, tenantId?: string) {
    const identity = await this.repository.getIdentity(deviceId, tenantId);
    const latestEvidence = await this.repository.getLatestEvidence(deviceId);

    return {
      deviceId,
      enrolled: !!identity,
      trustLevel: identity?.trustLevel ?? 'UNENROLLED',
      akName: identity?.akName,
      akFingerprint: identity?.akPublicKeyFingerprint,
      manufacturer: identity?.manufacturer,
      firmwareVersion: identity?.firmwareVersion,
      lastAttestedAt: identity?.lastAttestedAt,
      tpmState: latestEvidence?.tpmState ?? (identity ? 'PENDING' : 'ABSENT'),
      secureBootState: latestEvidence?.secureBootState ?? 'UNKNOWN',
      latestEvidenceId: latestEvidence?.id,
      checks: latestEvidence
        ? {
            structureValid: latestEvidence.structureValid,
            nonceVerified: latestEvidence.nonceVerified,
            signatureVerified: latestEvidence.signatureVerified,
            pcrDigestVerified: latestEvidence.pcrDigestVerified,
            akTrusted: latestEvidence.akTrusted,
            policyMatched: latestEvidence.policyMatched,
          }
        : null,
    };
  }

  async revokeDevice(deviceId: string, reason: string, tenantId?: string): Promise<boolean> {
    const revoked = await this.repository.revokeIdentity(deviceId, reason);
    if (revoked && tenantId) {
      await this.repository.logAuditEvent(tenantId, deviceId, 'AK_REVOKED', { reason });
    }
    return revoked;
  }

  async getHistory(deviceId: string, limit: number = 20): Promise<AttestationEvidenceRecord[]> {
    return this.repository.listEvidenceHistory(deviceId, limit);
  }

  async getFleetStats(tenantId?: string) {
    return this.repository.getFleetStats(tenantId);
  }
}
