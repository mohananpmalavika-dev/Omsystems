/**
 * Attestation Service
 * Main orchestration service for TPM remote attestation
 * Coordinates challenge, verification, and policy evaluation
 */

import { Pool } from 'pg';
import {
  AttestationStatus,
  AttestationAssurance,
  SecureBootVerificationResult,
  TpmQuoteSubmission,
  DeviceAttestation,
  DeviceAttestationIdentity,
  EnrollIdentityRequest,
  EnrollIdentityResponse,
  IdentityTrustLevel
} from '../types/attestation.types';
import { AttestationIdentityRepository } from '../repositories/attestation-identity.repository';
import { DeviceAttestationRepository } from '../repositories/device-attestation.repository';
import { AttestationChallengeService } from './attestation-challenge.service';
import { BootPolicyService } from './boot-policy.service';
import { TpmQuoteVerifier } from './tpm-quote-verifier.interface';
import { createTpmQuoteVerifier } from './tpm2-quote-verifier';
import {
  verifyChallengeNonce,
  validatePcrSelection,
  isAttestationFresh
} from '../utils/attestation-crypto.utils';

export class AttestationService {
  private identityRepo: AttestationIdentityRepository;
  private attestationRepo: DeviceAttestationRepository;
  private challengeService: AttestationChallengeService;
  private policyService: BootPolicyService;
  private quoteVerifier: TpmQuoteVerifier;

  constructor(
    private pool: Pool,
    config?: {
      mockVerifier?: boolean;
      useTpm2Tools?: boolean;
    }
  ) {
    this.identityRepo = new AttestationIdentityRepository(pool);
    this.attestationRepo = new DeviceAttestationRepository(pool);
    this.challengeService = new AttestationChallengeService(pool);
    this.policyService = new BootPolicyService(pool);
    this.quoteVerifier = createTpmQuoteVerifier({
      mock: config?.mockVerifier,
      useTpm2Tools: config?.useTpm2Tools
    });
  }

  /**
   * Enroll device attestation identity
   */
  async enrollIdentity(
    tenantId: string,
    request: EnrollIdentityRequest
  ): Promise<EnrollIdentityResponse> {
    const identity = await this.identityRepo.enroll({
      tenantId,
      deviceId: request.deviceId,
      akPublicKeyPem: request.akPublicKeyPem,
      akName: request.akName,
      ekPublicKeyHash: request.tpmInfo?.ekPublicKeyHash,
      tpmManufacturer: request.tpmInfo?.manufacturer,
      tpmFirmwareVersion: request.tpmInfo?.firmwareVersion,
      trustLevel: IdentityTrustLevel.ENROLLED
    });

    console.log(`🔐 Enrolled attestation identity for device ${request.deviceId}`);

    return {
      identityId: identity.id,
      enrolled: true,
      trustLevel: identity.trustLevel
    };
  }

  /**
   * Verify TPM attestation
   * Main attestation verification pipeline
   */
  async verifyAttestation(
    tenantId: string,
    submission: TpmQuoteSubmission
  ): Promise<SecureBootVerificationResult> {
    const failures: string[] = [];

    console.log(
      `🔍 Verifying attestation for device ${submission.deviceId}, challenge ${submission.challengeId}`
    );

    // Step 1: Resolve registered device identity
    const identity = await this.identityRepo.findByDeviceId(
      tenantId,
      submission.deviceId
    );

    if (!identity) {
      return this.createFailureResult(
        'DEVICE_NOT_ENROLLED',
        'Attestation identity not enrolled for this device'
      );
    }

    if (identity.revokedAt) {
      return this.createFailureResult(
        'IDENTITY_REVOKED',
        `Attestation identity revoked: ${identity.revokedReason}`
      );
    }

    // Step 2: Validate and consume challenge
    const challengeResult = await this.challengeService.validateAndConsume(
      submission.challengeId,
      submission.deviceId
    );

    if (!challengeResult.valid || !challengeResult.challenge) {
      return this.createFailureResult(
        challengeResult.reason || 'INVALID_CHALLENGE',
        'Challenge validation failed'
      );
    }

    const challenge = challengeResult.challenge;
    let nonceVerified = false;
    let quoteVerified = false;
    let pcrDigestVerified = false;
    let policyVerified = false;

    // Step 3: Parse TPM quote
    let parsedQuote;
    try {
      parsedQuote = await this.quoteVerifier.parse(submission.quote);
    } catch (error: any) {
      failures.push('INVALID_QUOTE_FORMAT');
      return this.createFailureResult(
        'INVALID_QUOTE_FORMAT',
        `Failed to parse TPM quote: ${error.message}`,
        { quoteVerified, nonceVerified, pcrDigestVerified, policyVerified, failures }
      );
    }

    // Step 4: Verify nonce / freshness
    try {
      const extraData = await this.quoteVerifier.extractExtraData(submission.quote);
      nonceVerified = verifyChallengeNonce(extraData, challenge.nonceHash);

      if (!nonceVerified) {
        failures.push('NONCE_MISMATCH');
      }
    } catch (error: any) {
      failures.push('NONCE_VERIFICATION_ERROR');
      nonceVerified = false;
    }

    // Step 5: Verify AK signature
    try {
      quoteVerified = await this.quoteVerifier.verifySignature({
        quote: submission.quote,
        signature: submission.signature,
        akPublicKeyPem: identity.akPublicKeyPem
      });

      if (!quoteVerified) {
        failures.push('INVALID_QUOTE_SIGNATURE');
      }
    } catch (error: any) {
      failures.push('QUOTE_SIGNATURE_VERIFICATION_ERROR');
      quoteVerified = false;
    }

    // Step 6: Validate PCR selection
    const pcrSelectionValid = validatePcrSelection(
      submission.pcrSelection,
      challenge.requestedPcrSelection.pcrs
    );

    if (!pcrSelectionValid) {
      failures.push('INVALID_PCR_SELECTION');
    }

    // Step 7: Verify PCR digest
    try {
      pcrDigestVerified = await this.quoteVerifier.verifyPcrDigest({
        quote: parsedQuote,
        pcrValues: submission.pcrValues,
        selection: submission.pcrSelection
      });

      if (!pcrDigestVerified) {
        failures.push('PCR_DIGEST_MISMATCH');
      }
    } catch (error: any) {
      failures.push('PCR_DIGEST_VERIFICATION_ERROR');
      pcrDigestVerified = false;
    }

    // Step 8: Resolve and evaluate boot policy
    let policyId: string | undefined;
    const policy = await this.policyService.resolveForDevice({
      tenantId,
      platformType: 'generic', // TODO: Get from device metadata
      hardwareModel: undefined
    });

    if (policy) {
      policyId = policy.id;

      const policyResult = await this.policyService.evaluatePolicy(
        policy,
        submission.pcrValues
      );

      policyVerified = policyResult.valid;

      if (!policyVerified) {
        failures.push(...policyResult.failures);
      }

      console.log(
        `📋 Policy evaluation: ${policyResult.matchedMeasurements}/${policyResult.totalMeasurements} matched`
      );
    } else {
      // No policy configured - cannot verify policy compliance
      failures.push('NO_ATTESTATION_POLICY');
      policyVerified = false;
    }

    // Step 9: Determine overall status
    let status: AttestationStatus;
    let assurance: AttestationAssurance;

    if (failures.length === 0) {
      status = AttestationStatus.VERIFIED;
      assurance = AttestationAssurance.HARDWARE_ATTESTED;
      console.log(`✅ Attestation VERIFIED for device ${submission.deviceId}`);
    } else {
      status = AttestationStatus.FAILED;
      assurance = AttestationAssurance.HARDWARE_ATTESTED; // Still hardware, just failed policy
      console.log(
        `❌ Attestation FAILED for device ${submission.deviceId}: ${failures.join(', ')}`
      );
    }

    // Step 10: Record attestation result
    await this.recordAttestation({
      tenantId,
      deviceId: submission.deviceId,
      challengeId: submission.challengeId,
      status,
      assurance,
      quoteVerified,
      nonceVerified,
      pcrDigestVerified,
      policyVerified,
      failures: failures.length > 0 ? failures : undefined,
      pcrValues: submission.pcrValues,
      bootPolicyId: policyId,
      secureBootEnabled: submission.secureBootState?.enabled
    });

    return {
      status,
      assurance,
      quoteVerified,
      nonceVerified,
      pcrDigestVerified,
      policyVerified,
      secureBootEnabled: submission.secureBootState?.enabled,
      tpmPresent: true,
      tpmVersion: identity.tpmManufacturer || 'TPM 2.0',
      measuredAt: new Date(),
      failures: failures.length > 0 ? failures : undefined,
      policyId,
      policyVersion: policy?.version
    };
  }

  /**
   * Get latest attestation status for device
   */
  async getDeviceAttestationStatus(
    tenantId: string,
    deviceId: string,
    maxAgeSeconds: number = 86400
  ): Promise<SecureBootVerificationResult> {
    const latest = await this.attestationRepo.getLatest(tenantId, deviceId);

    if (!latest) {
      return {
        status: AttestationStatus.NOT_CONFIGURED,
        assurance: AttestationAssurance.NONE,
        quoteVerified: false,
        nonceVerified: false,
        pcrDigestVerified: false,
        policyVerified: false,
        reason: 'No attestation record found'
      };
    }

    // Check freshness
    const fresh = isAttestationFresh(latest.attestedAt, maxAgeSeconds);

    if (!fresh) {
      return {
        status: AttestationStatus.STALE,
        assurance: latest.assurance,
        quoteVerified: latest.quoteVerified,
        nonceVerified: latest.nonceVerified,
        pcrDigestVerified: latest.pcrDigestVerified,
        policyVerified: latest.policyVerified,
        secureBootEnabled: latest.secureBootEnabled,
        measuredAt: latest.attestedAt,
        reason: `Attestation is stale (${Math.floor((Date.now() - latest.attestedAt.getTime()) / 1000)}s old)`
      };
    }

    return {
      status: latest.status,
      assurance: latest.assurance,
      quoteVerified: latest.quoteVerified,
      nonceVerified: latest.nonceVerified,
      pcrDigestVerified: latest.pcrDigestVerified,
      policyVerified: latest.policyVerified,
      secureBootEnabled: latest.secureBootEnabled,
      measuredAt: latest.attestedAt,
      failures: latest.failureReasons,
      policyId: latest.bootPolicyId
    };
  }

  /**
   * Check if device requires re-attestation
   */
  async requiresAttestation(
    tenantId: string,
    deviceId: string,
    maxAgeSeconds: number = 86400
  ): Promise<boolean> {
    const hasFresh = await this.attestationRepo.hasFreshAttestation(
      tenantId,
      deviceId,
      maxAgeSeconds
    );

    return !hasFresh;
  }

  /**
   * Get attestation statistics
   */
  async getStatistics(tenantId: string) {
    return this.attestationRepo.getStatistics(tenantId);
  }

  /**
   * Record attestation result
   */
  private async recordAttestation(params: {
    tenantId: string;
    deviceId: string;
    challengeId: string;
    status: AttestationStatus;
    assurance: AttestationAssurance;
    quoteVerified: boolean;
    nonceVerified: boolean;
    pcrDigestVerified: boolean;
    policyVerified: boolean;
    failures?: string[];
    pcrValues: Record<string, string>;
    bootPolicyId?: string;
    secureBootEnabled?: boolean;
  }): Promise<DeviceAttestation> {
    return this.attestationRepo.create(params);
  }

  /**
   * Create failure result
   */
  private createFailureResult(
    reason: string,
    message: string,
    partial?: {
      quoteVerified: boolean;
      nonceVerified: boolean;
      pcrDigestVerified: boolean;
      policyVerified: boolean;
      failures: string[];
    }
  ): SecureBootVerificationResult {
    return {
      status: AttestationStatus.FAILED,
      assurance: AttestationAssurance.NONE,
      quoteVerified: partial?.quoteVerified || false,
      nonceVerified: partial?.nonceVerified || false,
      pcrDigestVerified: partial?.pcrDigestVerified || false,
      policyVerified: partial?.policyVerified || false,
      reason: message,
      failures: partial?.failures || [reason]
    };
  }
}
