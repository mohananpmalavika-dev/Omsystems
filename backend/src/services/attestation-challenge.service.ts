/**
 * Attestation Challenge Service
 * Generates and manages challenge-response nonces for TPM attestation
 */

import { Pool } from 'pg';
import {
  AttestationChallenge,
  AttestationChallengePayload,
  PcrSelection,
  CreateChallengeRequest,
  CreateChallengeResponse
} from '../types/attestation.types';
import { AttestationChallengeRepository } from '../repositories/attestation-challenge.repository';
import { BootPolicyRepository } from '../repositories/boot-policy.repository';
import {
  createNonce,
  hashNonce,
  generateChallengeId
} from '../utils/attestation-crypto.utils';

export class AttestationChallengeService {
  private challengeRepo: AttestationChallengeRepository;
  private policyRepo: BootPolicyRepository;

  constructor(private pool: Pool) {
    this.challengeRepo = new AttestationChallengeRepository(pool);
    this.policyRepo = new BootPolicyRepository(pool);
  }

  /**
   * Create attestation challenge for device
   */
  async createChallenge(
    tenantId: string,
    request: CreateChallengeRequest,
    config?: {
      expirationSeconds?: number;
      nonceLengthBytes?: number;
    }
  ): Promise<CreateChallengeResponse> {
    const expirationSeconds = config?.expirationSeconds || 300; // 5 minutes default
    const nonceLengthBytes = config?.nonceLengthBytes || 32;

    // Generate fresh nonce
    const nonce = createNonce(nonceLengthBytes);
    const nonceHash = hashNonce(nonce);

    // Determine PCR selection
    let pcrSelection: PcrSelection;

    if (request.pcrSelection) {
      pcrSelection = request.pcrSelection;
    } else {
      // Use default PCR selection or from policy
      const policy = await this.policyRepo.findActiveForPlatform(
        tenantId,
        'default' // Will be enhanced to match device platform
      );

      if (policy) {
        pcrSelection = {
          hashAlgorithm: policy.hashAlgorithm,
          pcrs: policy.requiredPcrs
        };
      } else {
        // Default: standard boot PCRs
        pcrSelection = {
          hashAlgorithm: 'sha256',
          pcrs: [0, 2, 4, 7] // UEFI, Option ROMs, Boot Loader, Secure Boot
        };
      }
    }

    // Create challenge record
    const challenge = await this.challengeRepo.create({
      tenantId,
      deviceId: request.deviceId,
      nonceHash,
      requestedPcrSelection: pcrSelection,
      expirationSeconds
    });

    console.log(
      `✓ Created attestation challenge ${challenge.id} for device ${request.deviceId}`
    );

    return {
      challengeId: challenge.id,
      nonce,
      expiresAt: challenge.expiresAt.toISOString(),
      pcrSelection
    };
  }

  /**
   * Validate and consume challenge
   * Returns challenge if valid and not yet used
   */
  async validateAndConsume(
    challengeId: string,
    deviceId: string
  ): Promise<{
    valid: boolean;
    challenge?: AttestationChallenge;
    reason?: string;
  }> {
    // Attempt to atomically consume the challenge
    const challenge = await this.challengeRepo.consume(challengeId, deviceId);

    if (!challenge) {
      // Check why it failed
      const existingChallenge = await this.challengeRepo.findById(challengeId);

      if (!existingChallenge) {
        return {
          valid: false,
          reason: 'UNKNOWN_CHALLENGE'
        };
      }

      if (existingChallenge.deviceId !== deviceId) {
        return {
          valid: false,
          reason: 'DEVICE_CHALLENGE_MISMATCH'
        };
      }

      if (existingChallenge.usedAt) {
        return {
          valid: false,
          reason: 'CHALLENGE_ALREADY_USED'
        };
      }

      if (existingChallenge.expiresAt < new Date()) {
        return {
          valid: false,
          reason: 'CHALLENGE_EXPIRED'
        };
      }

      return {
        valid: false,
        reason: 'CHALLENGE_CONSUMPTION_FAILED'
      };
    }

    console.log(`✓ Consumed attestation challenge ${challengeId}`);

    return {
      valid: true,
      challenge
    };
  }

  /**
   * Get challenge by ID (does not consume)
   */
  async getChallenge(challengeId: string): Promise<AttestationChallenge | null> {
    return this.challengeRepo.findById(challengeId);
  }

  /**
   * List challenges for device
   */
  async listDeviceChallenges(
    tenantId: string,
    deviceId: string,
    limit?: number
  ): Promise<AttestationChallenge[]> {
    return this.challengeRepo.listByDevice(tenantId, deviceId, limit);
  }

  /**
   * Clean up expired challenges
   * Should be called periodically
   */
  async cleanupExpired(olderThanHours: number = 24): Promise<number> {
    const deleted = await this.challengeRepo.cleanupExpired(olderThanHours);
    
    if (deleted > 0) {
      console.log(`🧹 Cleaned up ${deleted} expired attestation challenges`);
    }

    return deleted;
  }

  /**
   * Get challenge statistics
   */
  async getStatistics(tenantId: string): Promise<{
    total: number;
    active: number;
    expired: number;
    used: number;
  }> {
    return this.challengeRepo.getStatistics(tenantId);
  }

  /**
   * Create canonical challenge payload
   * Used for binding challenge to specific context
   */
  createChallengePayload(
    challenge: AttestationChallenge,
    nonce: string,
    policyId: string
  ): AttestationChallengePayload {
    return {
      version: 1,
      challengeId: challenge.id,
      tenantId: challenge.tenantId,
      deviceId: challenge.deviceId,
      nonce,
      issuedAt: challenge.createdAt.getTime(),
      policyId,
      pcrSelection: challenge.requestedPcrSelection
    };
  }
}
