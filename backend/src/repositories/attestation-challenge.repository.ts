/**
 * Attestation Challenge Repository
 * Manages challenge-response nonces for preventing replay attacks
 */

import { Pool } from 'pg';
import {
  AttestationChallenge,
  PcrSelection
} from '../types/attestation.types';
import { generateChallengeId } from '../utils/attestation-crypto.utils';

export class AttestationChallengeRepository {
  constructor(private pool: Pool) {}

  /**
   * Create a new attestation challenge
   */
  async create(params: {
    tenantId: string;
    deviceId: string;
    nonceHash: string;
    requestedPcrSelection: PcrSelection;
    expirationSeconds: number;
  }): Promise<AttestationChallenge> {
    const id = generateChallengeId();
    const expiresAt = new Date(Date.now() + params.expirationSeconds * 1000);

    const result = await this.pool.query(
      `INSERT INTO tpm_attestation_challenges (
        id, tenant_id, device_id, nonce_hash,
        requested_pcrs, hash_algorithm, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        id,
        params.tenantId,
        params.deviceId,
        Buffer.from(params.nonceHash, 'hex'),
        params.requestedPcrSelection.pcrs,
        params.requestedPcrSelection.hashAlgorithm,
        expiresAt
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find challenge by ID
   */
  async findById(id: string): Promise<AttestationChallenge | null> {
    const result = await this.pool.query(
      `SELECT * FROM tpm_attestation_challenges WHERE id = $1`,
      [id]
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Consume challenge (atomic, one-time use)
   */
  async consume(
    challengeId: string,
    deviceId: string
  ): Promise<AttestationChallenge | null> {
    const result = await this.pool.query(
      `SELECT * FROM consume_attestation_challenge($1, $2)`,
      [challengeId, deviceId]
    );

    if (result.rows[0]?.success) {
      const challengeData = result.rows[0].challenge_record;
      return challengeData ? this.mapRow(challengeData) : null;
    }

    return null;
  }

  /**
   * Mark challenge as used
   */
  async markUsed(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE tpm_attestation_challenges
       SET used_at = NOW()
       WHERE id = $1 AND used_at IS NULL AND expires_at > NOW()
       RETURNING id`,
      [id]
    );

    return result.rows.length > 0;
  }

  /**
   * List challenges for device
   */
  async listByDevice(
    tenantId: string,
    deviceId: string,
    limit: number = 50
  ): Promise<AttestationChallenge[]> {
    const result = await this.pool.query(
      `SELECT * FROM tpm_attestation_challenges
       WHERE tenant_id = $1 AND device_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [tenantId, deviceId, limit]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Clean up expired challenges
   */
  async cleanupExpired(olderThanHours: number = 24): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    const result = await this.pool.query(
      `DELETE FROM tpm_attestation_challenges
       WHERE expires_at < $1
       RETURNING id`,
      [cutoffDate]
    );

    return result.rowCount || 0;
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
    const result = await this.pool.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE used_at IS NULL AND expires_at > NOW()) as active,
        COUNT(*) FILTER (WHERE used_at IS NULL AND expires_at <= NOW()) as expired,
        COUNT(*) FILTER (WHERE used_at IS NOT NULL) as used
       FROM tpm_attestation_challenges
       WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '7 days'`,
      [tenantId]
    );

    const row = result.rows[0];
    return {
      total: parseInt(row.total),
      active: parseInt(row.active),
      expired: parseInt(row.expired),
      used: parseInt(row.used)
    };
  }

  private mapRow(row: any): AttestationChallenge {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      deviceId: row.device_id,
      nonceHash: row.nonce_hash.toString('hex'),
      requestedPcrSelection: {
        hashAlgorithm: row.hash_algorithm,
        pcrs: row.requested_pcrs
      },
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      usedAt: row.used_at
    };
  }
}
