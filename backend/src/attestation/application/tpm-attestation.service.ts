/**
 * TPM Attestation Service
 * Main orchestrator for remote attestation workflow
 * 
 * Coordinates:
 * - Challenge issuance
 * - Evidence submission and verification
 * - Cryptographic validation
 * - AK trust decisions
 * - PCR policy evaluation
 * - Secure boot state determination
 */

import {
  AttestationChallenge,
  TpmAttestationSubmission,
  AttestationResult,
  TpmState,
  SecureBootState,
  AttestationFreshness,
  TpmQuoteVerificationResult,
  AttestationFailureReason,
  TpmAttestationEvidenceRecord,
  AttestationStatistics,
} from '../domain/attestation.types';
import {
  AttestationError,
  CryptographicVerificationError,
  UnsupportedSecurityOperationError,
} from '../domain/attestation-errors';
import {
  parseAndValidateQuote,
  extractNonceFromQuote,
  extractPcrSelection,
} from '../crypto/tpms-attest.parser';
import { verifyTpmQuoteSignature } from '../crypto/tpm-signature.verifier';
import {
  verifyPcrDigest,
  validatePcrSelection,
  validatePcrValuesFormat,
} from '../crypto/pcr-digest.verifier';
import { AttestationChallengeService } from './attestation-challenge.service';
import { AttestationKeyService } from '../trust/attestation-key.service';
import { PcrPolicyService } from './pcr-policy.service';

/**
 * In-memory evidence store
 * Production should use persistent database
 */
interface EvidenceStore {
  evidence: Map<string, TpmAttestationEvidenceRecord>;
  deviceLatestEvidence: Map<string, string>; // deviceId -> evidenceId
}

/**
 * TPM Quote Verifier
 * Encapsulates all cryptographic verification logic
 */
class TpmQuoteVerifier {
  /**
   * Verify TPM quote with all cryptographic checks
   */
  async verify(params: {
    challenge: AttestationChallenge;
    submission: TpmAttestationSubmission;
    akPublicKeyPem: string;
  }): Promise<TpmQuoteVerificationResult> {
    const result: TpmQuoteVerificationResult = {
      valid: false,
      nonceVerified: null,
      quoteSignatureVerified: null,
      pcrDigestVerified: null,
      akTrusted: null,
      pcrSelectionVerified: null,
      structureValid: null,
    };

    try {
      // Step 1: Parse and validate quote structure
      console.log('  [1/5] Parsing TPMS_ATTEST structure...');
      const quoteBuffer = Buffer.from(params.submission.quote, 'base64');
      const parsedQuote = parseAndValidateQuote(quoteBuffer);
      result.structureValid = true;
      result.parsedQuote = parsedQuote;
      console.log('  ✓ Quote structure valid');

      // Step 2: Verify nonce
      console.log('  [2/5] Verifying nonce...');
      const quoteNonce = extractNonceFromQuote(parsedQuote);
      const expectedNonce = Buffer.from(params.challenge.nonce, 'base64');

      if (quoteNonce.length !== expectedNonce.length) {
        result.nonceVerified = false;
        result.failureReason = AttestationFailureReason.NONCE_MISMATCH;
        throw new CryptographicVerificationError(
          AttestationFailureReason.NONCE_MISMATCH,
          `Nonce length mismatch: expected ${expectedNonce.length}, got ${quoteNonce.length}`,
          { expectedLength: expectedNonce.length, actualLength: quoteNonce.length }
        );
      }

      if (!quoteNonce.equals(expectedNonce)) {
        result.nonceVerified = false;
        result.failureReason = AttestationFailureReason.NONCE_MISMATCH;
        throw new CryptographicVerificationError(
          AttestationFailureReason.NONCE_MISMATCH,
          'Quote nonce does not match challenge nonce',
          {
            expectedNonce: expectedNonce.toString('hex').substring(0, 32),
            actualNonce: quoteNonce.toString('hex').substring(0, 32),
          }
        );
      }

      result.nonceVerified = true;
      console.log('  ✓ Nonce verified');

      // Step 3: Verify PCR selection
      console.log('  [3/5] Verifying PCR selection...');
      const pcrSelection = extractPcrSelection(parsedQuote);
      validatePcrSelection(pcrSelection, params.challenge.requestedPcrs);
      result.pcrSelectionVerified = true;
      console.log(`  ✓ PCR selection verified: ${pcrSelection.pcrs.join(',')}`);

      // Step 4: Verify PCR digest
      console.log('  [4/5] Verifying PCR digest...');
      
      // Validate PCR values format first
      const formatErrors = validatePcrValuesFormat(
        params.submission.pcrValues,
        pcrSelection.hashAlgorithm
      );
      
      if (formatErrors.length > 0) {
        result.pcrDigestVerified = false;
        result.failureReason = AttestationFailureReason.PCR_DIGEST_MISMATCH;
        throw new CryptographicVerificationError(
          AttestationFailureReason.PCR_DIGEST_MISMATCH,
          `Invalid PCR value format: ${formatErrors.join('; ')}`,
          { errors: formatErrors }
        );
      }

      verifyPcrDigest(params.submission.pcrValues, parsedQuote);
      result.pcrDigestVerified = true;
      console.log('  ✓ PCR digest verified');

      // Step 5: Verify quote signature
      console.log('  [5/5] Verifying TPM signature...');
      const signatureBuffer = Buffer.from(params.submission.signature, 'base64');
      const signatureValid = verifyTpmQuoteSignature(
        quoteBuffer,
        signatureBuffer,
        params.akPublicKeyPem
      );

      if (!signatureValid) {
        result.quoteSignatureVerified = false;
        result.failureReason = AttestationFailureReason.QUOTE_SIGNATURE_INVALID;
        throw new CryptographicVerificationError(
          AttestationFailureReason.QUOTE_SIGNATURE_INVALID,
          'TPM quote signature verification failed'
        );
      }

      result.quoteSignatureVerified = true;
      console.log('  ✓ Quote signature verified');

      // All checks passed
      result.valid = true;
      result.akTrusted = true; // Set by caller after AK trust check

      return result;
    } catch (error) {
      if (error instanceof AttestationError) {
        result.failureReason = error.reason;
      }
      throw error;
    }
  }
}

/**
 * Main TPM Attestation Service
 */
export class TpmAttestationService {
  private challengeService: AttestationChallengeService;
  private akService: AttestationKeyService;
  private policyService: PcrPolicyService;
  private quoteVerifier: TpmQuoteVerifier;

  private evidenceStore: EvidenceStore = {
    evidence: new Map(),
    deviceLatestEvidence: new Map(),
  };

  constructor(
    challengeService?: AttestationChallengeService,
    akService?: AttestationKeyService,
    policyService?: PcrPolicyService
  ) {
    this.challengeService = challengeService ?? new AttestationChallengeService();
    this.akService = akService ?? new AttestationKeyService();
    this.policyService = policyService ?? new PcrPolicyService();
    this.quoteVerifier = new TpmQuoteVerifier();
  }

  /**
   * Issue attestation challenge to device
   */
  async issueChallenge(
    tenantId: string,
    deviceId: string,
    options?: {
      requestedPcrs?: number[];
    }
  ): Promise<AttestationChallenge> {
    console.log(`🎲 Issuing attestation challenge for device ${deviceId}`);

    return this.challengeService.issueChallenge(tenantId, deviceId, options);
  }

  /**
   * Submit and verify attestation evidence
   * This is the main verification pipeline
   */
  async submitEvidence(
    tenantId: string,
    deviceId: string,
    submission: TpmAttestationSubmission
  ): Promise<AttestationResult> {
    console.log(`🔍 Processing attestation evidence for device ${deviceId}`);

    const result: AttestationResult = {
      tpmState: TpmState.UNKNOWN,
      secureBootState: SecureBootState.UNKNOWN,
      verifiedAt: null,
      nonceVerified: null,
      quoteSignatureVerified: null,
      pcrDigestVerified: null,
      akTrusted: null,
      policyMatched: null,
    };

    try {
      // Step 1: Validate and consume challenge
      console.log('Step 1: Validating challenge...');
      const challenge = await this.challengeService.validateAndConsumeChallenge(
        submission.challengeId,
        deviceId
      );
      result.challengeId = challenge.id;

      // Step 2: Verify AK trust
      console.log('Step 2: Verifying Attestation Key trust...');
      const akTrust = await this.akService.verifyAkTrust(
        deviceId,
        submission.akPublicKey
      );

      if (!akTrust.trusted) {
        result.tpmState = TpmState.FAILED;
        result.akTrusted = false;
        result.failureReason = akTrust.reason;
        
        console.log(`❌ AK trust verification failed: ${akTrust.message}`);
        
        // Store failed evidence
        await this.storeEvidence(tenantId, deviceId, challenge, submission, result);
        
        return result;
      }

      result.akTrusted = true;
      console.log('✓ AK trusted');

      // Step 3: Cryptographic verification
      console.log('Step 3: Cryptographic verification...');
      const quoteVerification = await this.quoteVerifier.verify({
        challenge,
        submission,
        akPublicKeyPem: submission.akPublicKey,
      });

      result.nonceVerified = quoteVerification.nonceVerified;
      result.quoteSignatureVerified = quoteVerification.quoteSignatureVerified;
      result.pcrDigestVerified = quoteVerification.pcrDigestVerified;

      if (!quoteVerification.valid) {
        result.tpmState = TpmState.FAILED;
        result.failureReason = quoteVerification.failureReason;
        
        console.log(`❌ Quote verification failed: ${result.failureReason}`);
        
        // Store failed evidence
        await this.storeEvidence(tenantId, deviceId, challenge, submission, result);
        
        return result;
      }

      // Cryptographic verification passed
      result.tpmState = TpmState.ATTESTED;
      result.verifiedAt = new Date();
      console.log('✓ TPM cryptographically attested');

      // Step 4: PCR policy evaluation
      console.log('Step 4: Evaluating PCR policy...');
      const policyEvaluation = await this.policyService.evaluateWithAutoPolicy({
        tenantId,
        pcrValues: submission.pcrValues,
        platform: submission.metadata.tpmVersion ?? 'Unknown',
        identity: akTrust.identity,
      });

      if (!policyEvaluation) {
        // No policy available - TPM is attested but secure boot state is unknown
        console.log('⚠️  No PCR policy available for evaluation');
        result.secureBootState = SecureBootState.UNKNOWN;
        result.policyMatched = null;
      } else if (!policyEvaluation.matched) {
        // Policy exists but doesn't match
        console.log(`❌ PCR policy failed: ${policyEvaluation.violations.length} violation(s)`);
        result.secureBootState = SecureBootState.FAILED;
        result.policyMatched = false;
        result.policyViolations = policyEvaluation.violations;
      } else {
        // Policy matched - secure boot verified
        console.log('✓ PCR policy matched - Secure boot verified');
        result.secureBootState = SecureBootState.VERIFIED;
        result.policyMatched = true;
      }

      // Calculate freshness
      result.freshness = this.calculateFreshness(result.verifiedAt!);

      // Store evidence
      const evidenceRecord = await this.storeEvidence(
        tenantId,
        deviceId,
        challenge,
        submission,
        result,
        policyEvaluation ?? undefined
      );
      result.evidenceId = evidenceRecord.id;

      console.log(
        `✅ Attestation complete: TPM=${result.tpmState}, SecureBoot=${result.secureBootState}`
      );

      return result;
    } catch (error) {
      console.error('❌ Attestation error:', error);

      if (error instanceof AttestationError) {
        result.tpmState = TpmState.FAILED;
        result.failureReason = error.reason;
      } else {
        result.tpmState = TpmState.UNKNOWN;
        result.failureReason = AttestationFailureReason.ATTESTATION_UNAVAILABLE;
      }

      throw error;
    }
  }

  /**
   * Store attestation evidence (immutable record)
   */
  private async storeEvidence(
    tenantId: string,
    deviceId: string,
    challenge: AttestationChallenge,
    submission: TpmAttestationSubmission,
    result: AttestationResult,
    policyEvaluation?: any
  ): Promise<TpmAttestationEvidenceRecord> {
    const evidenceId = `evidence_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Build PCR values map
    const pcrValues: Record<number, string> = {};
    for (const pcr of submission.pcrValues) {
      pcrValues[pcr.index] = pcr.value;
    }

    const evidence: TpmAttestationEvidenceRecord = {
      id: evidenceId,
      tenantId,
      deviceId,
      challengeId: challenge.id,
      quote: Buffer.from(submission.quote, 'base64'),
      signature: Buffer.from(submission.signature, 'base64'),
      pcrValues,
      akFingerprint: submission.akPublicKey.substring(0, 64), // Simplified
      eventLog: submission.eventLog
        ? Buffer.from(submission.eventLog, 'base64')
        : undefined,
      metadata: submission.metadata,
      receivedAt: new Date(),
      verificationStatus:
        result.tpmState === TpmState.ATTESTED
          ? 'VERIFIED'
          : result.tpmState === TpmState.FAILED
          ? 'FAILED'
          : 'UNKNOWN',
      verifiedAt: result.verifiedAt ?? undefined,
      failureReason: result.failureReason,
      policyEvaluationResult: policyEvaluation,
    };

    // Store evidence
    this.evidenceStore.evidence.set(evidenceId, evidence);
    this.evidenceStore.deviceLatestEvidence.set(deviceId, evidenceId);

    return evidence;
  }

  /**
   * Calculate evidence freshness
   */
  private calculateFreshness(verifiedAt: Date): AttestationFreshness {
    const now = new Date();
    const ageSeconds = (now.getTime() - verifiedAt.getTime()) / 1000;

    if (ageSeconds <= 300) {
      // < 5 minutes
      return AttestationFreshness.FRESH;
    } else if (ageSeconds <= 1800) {
      // < 30 minutes
      return AttestationFreshness.ACCEPTABLE;
    } else if (ageSeconds <= 7200) {
      // < 2 hours
      return AttestationFreshness.STALE;
    } else {
      return AttestationFreshness.EXPIRED;
    }
  }

  /**
   * Get latest attestation result for device
   */
  async getLatestAttestation(deviceId: string): Promise<AttestationResult | null> {
    const evidenceId = this.evidenceStore.deviceLatestEvidence.get(deviceId);

    if (!evidenceId) {
      return null;
    }

    const evidence = this.evidenceStore.evidence.get(evidenceId);

    if (!evidence) {
      return null;
    }

    // Reconstruct result from evidence
    const result: AttestationResult = {
      tpmState:
        evidence.verificationStatus === 'VERIFIED'
          ? TpmState.ATTESTED
          : evidence.verificationStatus === 'FAILED'
          ? TpmState.FAILED
          : TpmState.UNKNOWN,
      secureBootState:
        evidence.policyEvaluationResult?.matched
          ? SecureBootState.VERIFIED
          : evidence.policyEvaluationResult
          ? SecureBootState.FAILED
          : SecureBootState.UNKNOWN,
      verifiedAt: evidence.verifiedAt ?? null,
      freshness: evidence.verifiedAt
        ? this.calculateFreshness(evidence.verifiedAt)
        : undefined,
      nonceVerified: evidence.verificationStatus === 'VERIFIED',
      quoteSignatureVerified: evidence.verificationStatus === 'VERIFIED',
      pcrDigestVerified: evidence.verificationStatus === 'VERIFIED',
      akTrusted: evidence.verificationStatus === 'VERIFIED',
      policyMatched: evidence.policyEvaluationResult?.matched ?? null,
      failureReason: evidence.failureReason,
      policyViolations: evidence.policyEvaluationResult?.violations,
      evidenceId: evidence.id,
      challengeId: evidence.challengeId,
    };

    return result;
  }

  /**
   * Get evidence by ID
   */
  async getEvidence(evidenceId: string): Promise<TpmAttestationEvidenceRecord | null> {
    return this.evidenceStore.evidence.get(evidenceId) ?? null;
  }

  /**
   * List evidence for device
   */
  async listDeviceEvidence(
    deviceId: string,
    limit: number = 10
  ): Promise<TpmAttestationEvidenceRecord[]> {
    const evidence: TpmAttestationEvidenceRecord[] = [];

    for (const record of this.evidenceStore.evidence.values()) {
      if (record.deviceId === deviceId) {
        evidence.push(record);
      }
    }

    // Sort by received date descending
    evidence.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

    return evidence.slice(0, limit);
  }

  /**
   * Get attestation statistics
   */
  async getStatistics(): Promise<AttestationStatistics> {
    const challengeStats = await this.challengeService.getStatistics();
    
    let verified = 0;
    let failed = 0;
    let pending = 0;
    let totalVerificationTime = 0;
    let verificationCount = 0;

    for (const evidence of this.evidenceStore.evidence.values()) {
      switch (evidence.verificationStatus) {
        case 'VERIFIED':
          verified++;
          if (evidence.verifiedAt) {
            const verificationTime =
              evidence.verifiedAt.getTime() - evidence.receivedAt.getTime();
            totalVerificationTime += verificationTime;
            verificationCount++;
          }
          break;
        case 'FAILED':
          failed++;
          break;
        case 'PENDING':
          pending++;
          break;
      }
    }

    const akStats = await this.akService.getStatistics('*'); // All tenants

    return {
      totalChallenges: challengeStats.totalChallenges,
      totalSubmissions: this.evidenceStore.evidence.size,
      verified,
      failed,
      pending,
      expiredChallenges: challengeStats.expiredChallenges,
      enrolledDevices: akStats.activeIdentities,
      revokedDevices: akStats.revokedIdentities,
      averageVerificationTimeMs:
        verificationCount > 0 ? totalVerificationTime / verificationCount : 0,
    };
  }

  /**
   * Get service instances (for external access)
   */
  getChallengeService(): AttestationChallengeService {
    return this.challengeService;
  }

  getAkService(): AttestationKeyService {
    return this.akService;
  }

  getPolicyService(): PcrPolicyService {
    return this.policyService;
  }
}

/**
 * Singleton instance (can be replaced with proper DI)
 */
export const tpmAttestationService = new TpmAttestationService();
