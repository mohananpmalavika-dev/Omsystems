/**
 * Device Attestation Repository
 * Manages attestation evidence history and verification results
 */

import { Pool } from 'pg';
import {
  DeviceAttestation,
  AttestationStatus,
  AttestationAssurance
} from '../types/attestation.types';
import { generateAttestationId } from '../utils/attestation-crypto.utils';

export class DeviceAttestationRepository {
  constructor(private pool: Pool) {}

  /**
   * Record attestation attempt
   */
  async create(params: {
    tenantId: string;
    deviceId: string;
    challengeId: string;
    status: AttestationStatus;
    assurance: AttestationAssurance;
    quoteVerified: boolean;
    nonceVerified: boolean;
    pcrDigestVerified: boolean;
    policyVerified: boolean;
    failureReasons?: string[];
    pcrValues: Record<string, string>;
    bootPolicyId?: string;
    secureBootEnabled?: boolean;
    attestedAt?: Date;
  }): Promise<DeviceAttestation> {
    const id = generateAttestationId();
    const attestedAt = params.attestedAt || new Date();

    const result = await this.pool.query(
      `INSERT INTO device_attestations (
        id, tenant_id, device_id, challenge_id,
        status, assurance,
        quote_verified, nonce_verified, pcr_digest_verified, policy_verified,
        failure_reasons, pcr_values, boot_policy_id, secure_boot_enabled,
        attested_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        id,
        params.tenantId,
        params.deviceId,
        params.challengeId,
        params.status,
        params.assurance,
        params.quoteVerified,
        params.nonceVerified,
        params.pcrDigestVerified,
        params.policyVerified,
        params.failureReasons ? JSON.stringify(params.failureReasons) : null,
        JSON.stringify(params.pcrValues),
        params.bootPolicyId || null,
        params.secureBootEnabled,
        attestedAt
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get latest attestation for device
   */
  async getLatest(
    tenantId: string,
    deviceId: string
  ): Promise<DeviceAttestation | null> {
    const result = await this.pool.query(
      `SELECT * FROM device_attestations
       WHERE tenant_id = $1 AND device_id = $2
       ORDER BY attested_at DESC
       LIMIT 1`,
      [tenantId, deviceId]
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Get attestation by ID
   */
  async findById(id: string): Promise<DeviceAttestation | null> {
    const result = await this.pool.query(
      `SELECT * FROM device_attestations WHERE id = $1`,
      [id]
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * List attestations for device
   */
  async listByDevice(
    tenantId: string,
    deviceId: string,
    limit: number = 100
  ): Promise<DeviceAttestation[]> {
    const result = await this.pool.query(
      `SELECT * FROM device_attestations
       WHERE tenant_id = $1 AND device_id = $2
       ORDER BY attested_at DESC
       LIMIT $3`,
      [tenantId, deviceId, limit]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * List all latest attestations for tenant
   */
  async listLatestByTenant(
    tenantId: string,
    filter?: {
      status?: AttestationStatus;
      assurance?: AttestationAssurance;
    }
  ): Promise<DeviceAttestation[]> {
    let query = `SELECT * FROM v_latest_device_attestations WHERE tenant_id = $1`;
    const params: any[] = [tenantId];

    if (filter?.status) {
      params.push(filter.status);
      query += ` AND status = $${params.length}`;
    }

    if (filter?.assurance) {
      params.push(filter.assurance);
      query += ` AND assurance = $${params.length}`;
    }

    query += ` ORDER BY attested_at DESC`;

    const result = await this.pool.query(query, params);
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Get failed attestations in time window
   */
  async getRecentFailures(
    tenantId: string,
    hoursBack: number = 24
  ): Promise<DeviceAttestation[]> {
    const cutoffDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const result = await this.pool.query(
      `SELECT * FROM device_attestations
       WHERE tenant_id = $1
         AND status = 'FAILED'
         AND attested_at >= $2
       ORDER BY attested_at DESC`,
      [tenantId, cutoffDate]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Get devices with stale attestation
   */
  async getStaleAttestations(
    tenantId: string,
    maxAgeSeconds: number
  ): Promise<DeviceAttestation[]> {
    const result = await this.pool.query(
      `SELECT * FROM v_latest_device_attestations
       WHERE tenant_id = $1
         AND age_seconds > $2
       ORDER BY age_seconds DESC`,
      [tenantId, maxAgeSeconds]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Check if device has fresh verified attestation
   */
  async hasFreshAttestation(
    tenantId: string,
    deviceId: string,
    maxAgeSeconds: number
  ): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT is_attestation_fresh($1, $2, $3) as fresh`,
      [tenantId, deviceId, maxAgeSeconds]
    );

    return result.rows[0]?.fresh || false;
  }

  /**
   * Get attestation statistics
   */
  async getStatistics(tenantId: string): Promise<{
    totalDevices: number;
    statusBreakdown: Record<AttestationStatus, number>;
    assuranceBreakdown: Record<AttestationAssurance, number>;
    recentFailures: number;
    staleAttestations: number;
    averageAttestationAgeSeconds: number;
    policyComplianceRate: number;
  }> {
    const result = await this.pool.query(
      `SELECT
        total_devices,
        verified_devices,
        failed_devices,
        stale_devices,
        unsupported_devices,
        hardware_attested_devices,
        avg_attestation_age_seconds
       FROM v_attestation_health
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const row = result.rows[0] || {
      total_devices: 0,
      verified_devices: 0,
      failed_devices: 0,
      stale_devices: 0,
      unsupported_devices: 0,
      hardware_attested_devices: 0,
      avg_attestation_age_seconds: 0
    };

    const totalDevices = parseInt(row.total_devices) || 0;
    const verifiedDevices = parseInt(row.verified_devices) || 0;

    return {
      totalDevices,
      statusBreakdown: {
        [AttestationStatus.VERIFIED]: verifiedDevices,
        [AttestationStatus.FAILED]: parseInt(row.failed_devices) || 0,
        [AttestationStatus.STALE]: parseInt(row.stale_devices) || 0,
        [AttestationStatus.UNSUPPORTED]: parseInt(row.unsupported_devices) || 0,
        [AttestationStatus.UNKNOWN]: 0,
        [AttestationStatus.NOT_CONFIGURED]: 0
      },
      assuranceBreakdown: {
        [AttestationAssurance.NONE]: 0,
        [AttestationAssurance.SELF_REPORTED]: 0,
        [AttestationAssurance.SIGNED_AGENT]: 0,
        [AttestationAssurance.HARDWARE_ATTESTED]: parseInt(row.hardware_attested_devices) || 0
      },
      recentFailures: parseInt(row.failed_devices) || 0,
      staleAttestations: parseInt(row.stale_devices) || 0,
      averageAttestationAgeSeconds: parseFloat(row.avg_attestation_age_seconds) || 0,
      policyComplianceRate: totalDevices > 0 ? verifiedDevices / totalDevices : 0
    };
  }

  /**
   * Clean up old attestation records
   */
  async cleanupOld(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await this.pool.query(
      `DELETE FROM device_attestations
       WHERE attested_at < $1
       RETURNING id`,
      [cutoffDate]
    );

    return result.rowCount || 0;
  }

  private mapRow(row: any): DeviceAttestation {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      deviceId: row.device_id,
      challengeId: row.challenge_id,
      status: row.status as AttestationStatus,
      assurance: row.assurance as AttestationAssurance,
      quoteVerified: row.quote_verified,
      nonceVerified: row.nonce_verified,
      pcrDigestVerified: row.pcr_digest_verified,
      policyVerified: row.policy_verified,
      failureReasons: row.failure_reasons ? JSON.parse(row.failure_reasons) : undefined,
      pcrValues: JSON.parse(row.pcr_values),
      bootPolicyId: row.boot_policy_id,
      secureBootEnabled: row.secure_boot_enabled,
      attestedAt: row.attested_at
    };
  }
}
