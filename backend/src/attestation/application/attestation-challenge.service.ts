/**
 * Attestation Challenge Service
 * Manages challenge-response protocol with cryptographic nonces
 */

import crypto from 'crypto';
import {
  AttestationChallenge,
  TpmHashAlgorithm,
  AttestationFailureReason,
  AttestationConfiguration,
} from '../domain/attestation.types';
import { ChallengeProtocolError } from '../domain/attestation-errors';

/**
 * Default attestation configuration
 */
const DEFAULT_CONFIG: AttestationConfiguration = {
  challengeExpirationSeconds: 120, // 2 minutes
  freshThresholdSeconds: 300, // 5 minutes
  acceptableThresholdSeconds: 1800, // 30 minutes
  staleThresholdSeconds: 7200, // 2 hours
  defaultPcrSelection: [0, 2, 4, 7], // BIOS, Option ROMs, Boot Loader, Secure Boot
  defaultHashAlgorithm: TpmHashAlgorithm.SHA256,
  maxChallengesPerDevicePerHour: 60,
};

/**
 * In-memory challenge store
 * Production should use database with proper indexing
 */
interface ChallengeStore {
  challenges: Map<string, AttestationChallenge>;
  deviceChallengeCount: Map<string, { count: number; windowStart: Date }>;
}

export class AttestationChallengeService {
  private store: ChallengeStore = {
    challenges: new Map(),
    deviceChallengeCount: new Map(),
  };

  private config: AttestationConfiguration;

  constructor(config?: Partial<AttestationConfiguration>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate cryptographically secure nonce
   */
  private generateNonce(lengthBytes: number = 32): string {
    return crypto.randomBytes(lengthBytes).toString('base64');
  }

  /**
   * Generate unique challenge ID
   */
  private generateChallengeId(): string {
    return `chal_${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * Check rate limit for device
   */
  private checkRateLimit(deviceId: string): void {
    const now = new Date();
    const record = this.store.deviceChallengeCount.get(deviceId);

    if (!record) {
      // First challenge for this device
      this.store.deviceChallengeCount.set(deviceId, {
        count: 1,
        windowStart: now,
      });
      return;
    }

    // Check if we're still in the same hour window
    const hoursSinceWindowStart =
      (now.getTime() - record.windowStart.getTime()) / (1000 * 60 * 60);

    if (hoursSinceWindowStart >= 1) {
      // Reset window
      this.store.deviceChallengeCount.set(deviceId, {
        count: 1,
        windowStart: now,
      });
      return;
    }

    // Check rate limit
    if (record.count >= this.config.maxChallengesPerDevicePerHour) {
      throw new ChallengeProtocolError(
        AttestationFailureReason.CHALLENGE_EXPIRED,
        `Rate limit exceeded: maximum ${this.config.maxChallengesPerDevicePerHour} challenges per device per hour`,
        {
          deviceId,
          currentCount: record.count,
          limit: this.config.maxChallengesPerDevicePerHour,
        }
      );
    }

    // Increment count
    record.count++;
  }

  /**
   * Issue new attestation challenge
   */
  async issueChallenge(
    tenantId: string,
    deviceId: string,
    options?: {
      requestedPcrs?: number[];
      hashAlgorithm?: TpmHashAlgorithm;
      expirationSeconds?: number;
    }
  ): Promise<AttestationChallenge> {
    // Check rate limit
    this.checkRateLimit(deviceId);

    const now = new Date();
    const expirationSeconds =
      options?.expirationSeconds ?? this.config.challengeExpirationSeconds;

    const challenge: AttestationChallenge = {
      id: this.generateChallengeId(),
      tenantId,
      deviceId,
      nonce: this.generateNonce(32),
      requestedPcrs:
        options?.requestedPcrs ?? this.config.defaultPcrSelection,
      hashAlgorithm:
        options?.hashAlgorithm ?? this.config.defaultHashAlgorithm,
      createdAt: now,
      expiresAt: new Date(now.getTime() + expirationSeconds * 1000),
      consumedAt: null,
    };

    // Store challenge
    this.store.challenges.set(challenge.id, challenge);

    console.log(
      `🎲 Issued attestation challenge ${challenge.id} for device ${deviceId}, expires in ${expirationSeconds}s`
    );

    return challenge;
  }

  /**
   * Retrieve challenge by ID
   */
  async getChallenge(challengeId: string): Promise<AttestationChallenge | null> {
    return this.store.challenges.get(challengeId) ?? null;
  }

  /**
   * Validate challenge and mark as consumed
   * Performs all protocol-level checks
   */
  async validateAndConsumeChallenge(
    challengeId: string,
    deviceId: string
  ): Promise<AttestationChallenge> {
    const challenge = this.store.challenges.get(challengeId);

    if (!challenge) {
      throw new ChallengeProtocolError(
        AttestationFailureReason.CHALLENGE_NOT_FOUND,
        `Challenge not found: ${challengeId}`,
        { challengeId }
      );
    }

    // Check device binding
    if (challenge.deviceId !== deviceId) {
      throw new ChallengeProtocolError(
        AttestationFailureReason.CHALLENGE_DEVICE_MISMATCH,
        `Challenge ${challengeId} was issued for device ${challenge.deviceId}, not ${deviceId}`,
        {
          challengeId,
          expectedDevice: challenge.deviceId,
          actualDevice: deviceId,
        }
      );
    }

    // Check expiration
    const now = new Date();
    if (challenge.expiresAt < now) {
      throw new ChallengeProtocolError(
        AttestationFailureReason.CHALLENGE_EXPIRED,
        `Challenge ${challengeId} expired at ${challenge.expiresAt.toISOString()}`,
        {
          challengeId,
          expiresAt: challenge.expiresAt,
          now,
        }
      );
    }

    // Check if already consumed (replay protection)
    if (challenge.consumedAt !== null) {
      throw new ChallengeProtocolError(
        AttestationFailureReason.CHALLENGE_ALREADY_USED,
        `Challenge ${challengeId} was already consumed at ${challenge.consumedAt.toISOString()}`,
        {
          challengeId,
          consumedAt: challenge.consumedAt,
        }
      );
    }

    // Mark as consumed
    challenge.consumedAt = now;

    console.log(`✓ Challenge ${challengeId} validated and consumed for device ${deviceId}`);

    return challenge;
  }

  /**
   * Verify nonce from TPM quote matches challenge
   * Uses timing-safe comparison
   */
  verifyNonce(challengeNonce: string, quoteExtraData: Buffer): boolean {
    // Convert challenge nonce from base64 to buffer
    const expectedNonce = Buffer.from(challengeNonce, 'base64');

    // Check length first (fast path)
    if (expectedNonce.length !== quoteExtraData.length) {
      return false;
    }

    // Timing-safe comparison
    return crypto.timingSafeEqual(expectedNonce, quoteExtraData);
  }

  /**
   * Create qualifying data for TPM quote
   * Binds challenge to device and tenant context
   */
  createQualifyingData(challenge: AttestationChallenge): Buffer {
    // Create canonical data structure
    const data = {
      version: 1,
      challengeId: challenge.id,
      deviceId: challenge.deviceId,
      tenantId: challenge.tenantId,
      nonce: challenge.nonce,
      issuedAt: challenge.createdAt.getTime(),
    };

    // Serialize to JSON with sorted keys for canonicalization
    const canonical = JSON.stringify(data, Object.keys(data).sort());

    // Hash to create qualifying data
    return crypto.createHash('sha256').update(canonical).digest();
  }

  /**
   * Clean up expired challenges (periodic maintenance)
   */
  async cleanupExpiredChallenges(): Promise<number> {
    const now = new Date();
    let cleaned = 0;

    for (const [id, challenge] of this.store.challenges.entries()) {
      if (challenge.expiresAt < now) {
        this.store.challenges.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired challenges`);
    }

    return cleaned;
  }

  /**
   * Get challenge statistics
   */
  async getStatistics(): Promise<{
    totalChallenges: number;
    activeChallenges: number;
    consumedChallenges: number;
    expiredChallenges: number;
  }> {
    const now = new Date();
    let active = 0;
    let consumed = 0;
    let expired = 0;

    for (const challenge of this.store.challenges.values()) {
      if (challenge.consumedAt !== null) {
        consumed++;
      } else if (challenge.expiresAt < now) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      totalChallenges: this.store.challenges.size,
      activeChallenges: active,
      consumedChallenges: consumed,
      expiredChallenges: expired,
    };
  }

  /**
   * List active challenges for a device
   */
  async listDeviceChallenges(deviceId: string): Promise<AttestationChallenge[]> {
    const challenges: AttestationChallenge[] = [];
    const now = new Date();

    for (const challenge of this.store.challenges.values()) {
      if (
        challenge.deviceId === deviceId &&
        challenge.consumedAt === null &&
        challenge.expiresAt >= now
      ) {
        challenges.push(challenge);
      }
    }

    return challenges;
  }

  /**
   * Revoke a challenge (make it unusable)
   */
  async revokeChallenge(challengeId: string, reason: string): Promise<boolean> {
    const challenge = this.store.challenges.get(challengeId);

    if (!challenge) {
      return false;
    }

    // Mark as consumed with a special timestamp to indicate revocation
    challenge.consumedAt = new Date(0); // Epoch indicates revoked

    console.log(`⚠️  Challenge ${challengeId} revoked: ${reason}`);

    return true;
  }

  /**
   * Get configuration
   */
  getConfiguration(): AttestationConfiguration {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfiguration(updates: Partial<AttestationConfiguration>): void {
    this.config = { ...this.config, ...updates };
    console.log('⚙️  Attestation configuration updated');
  }
}
