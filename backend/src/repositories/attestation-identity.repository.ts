/**
 * Device Attestation Identity Repository
 * Manages TPM Attestation Key (AK) enrollment and lifecycle
 */

import { Pool } from 'pg';
import {
  DeviceAttestationIdentity,
  IdentityTrustLevel
} from '../types/attestation.types';
import { generateIdentityId } from '../utils/attestation-crypto.utils';

export class AttestationIdentityRepository {
  constructor(private pool: Pool) {}

  /**
   * Enroll a new device attestation identity
   */
  async enroll(params: {
    tenantId: string;
    deviceId: string;
    akPublicKeyPem: string;
    akName?: string;
    ekPublicKeyHash?: string;
    tpmManufacturer?: string;
    tpmFirmwareVersion?: string;
    trustLevel?: IdentityTrustLevel;
  }): Promise<DeviceAttestationIdentity> {
    const id = generateIdentityId();
    const trustLevel = params.trustLevel || IdentityTrustLevel.UNVERIFIED;

    const result = await this.pool.query(
      `INSERT INTO device_attestation_identities (
        id, tenant_id, device_id, ak_public_key_pem, ak_name,
        ek_public_key_hash, tpm_manufacturer, tpm_firmware_version,
        trust_level
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (tenant_id, device_id)
      DO UPDATE SET
        ak_public_key_pem = EXCLUDED.ak_public_key_pem,
        ak_name = EXCLUDED.ak_name,
        ek_public_key_hash = EXCLUDED.ek_public_key_hash,
        tpm_manufacturer = EXCLUDED.tpm_manufacturer,
        tpm_firmware_version = EXCLUDED.tpm_firmware_version,
        trust_level = EXCLUDED.trust_level,
        updated_at = NOW()
      RETURNING *`,
      [
        id,
        params.tenantId,
        params.deviceId,
        params.akPublicKeyPem,
        params.akName || null,
        params.ekPublicKeyHash || null,
        params.tpmManufacturer || null,
        params.tpmFirmwareVersion || null,
        trustLevel
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find identity by device ID
   */
  async findByDeviceId(
    tenantId: string,
    deviceId: string
  ): Promise<DeviceAttestationIdentity | null> {
    const result = await this.pool.query(
      `SELECT * FROM device_attestation_identities
       WHERE tenant_id = $1 AND device_id = $2 AND revoked_at IS NULL`,
      [tenantId, deviceId]
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find identity by ID
   */
  async findById(id: string): Promise<DeviceAttestationIdentity | null> {
    const result = await this.pool.query(
      `SELECT * FROM device_attestation_identities WHERE id = $1`,
      [id]
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * List all identities for tenant
   */
  async listByTenant(
    tenantId: string,
    filter?: {
      trustLevel?: IdentityTrustLevel;
      includeRevoked?: boolean;
    }
  ): Promise<DeviceAttestationIdentity[]> {
    let query = `SELECT * FROM device_attestation_identities WHERE tenant_id = $1`;
    const params: any[] = [tenantId];

    if (!filter?.includeRevoked) {
      query += ` AND revoked_at IS NULL`;
    }

    if (filter?.trustLevel) {
      params.push(filter.trustLevel);
      query += ` AND trust_level = $${params.length}`;
    }

    query += ` ORDER BY enrolled_at DESC`;

    const result = await this.pool.query(query, params);
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Revoke an identity
   */
  async revoke(
    id: string,
    reason: string
  ): Promise<DeviceAttestationIdentity | null> {
    const result = await this.pool.query(
      `UPDATE device_attestation_identities
       SET revoked_at = NOW(), revoked_reason = $2, updated_at = NOW()
       WHERE id = $1 AND revoked_at IS NULL
       RETURNING *`,
      [id, reason]
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Update trust level
   */
  async updateTrustLevel(
    id: string,
    trustLevel: IdentityTrustLevel
  ): Promise<DeviceAttestationIdentity | null> {
    const result = await this.pool.query(
      `UPDATE device_attestation_identities
       SET trust_level = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, trustLevel]
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Check if device has enrolled identity
   */
  async hasEnrolledIdentity(
    tenantId: string,
    deviceId: string
  ): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM device_attestation_identities
       WHERE tenant_id = $1 AND device_id = $2 AND revoked_at IS NULL
       LIMIT 1`,
      [tenantId, deviceId]
    );

    return result.rows.length > 0;
  }

  /**
   * Get statistics
   */
  async getStatistics(tenantId: string): Promise<{
    total: number;
    byTrustLevel: Record<IdentityTrustLevel, number>;
    revoked: number;
  }> {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE revoked_at IS NULL) as total,
        COUNT(*) FILTER (WHERE trust_level = 'UNVERIFIED' AND revoked_at IS NULL) as unverified,
        COUNT(*) FILTER (WHERE trust_level = 'ENROLLED' AND revoked_at IS NULL) as enrolled,
        COUNT(*) FILTER (WHERE trust_level = 'TPM_PROVEN' AND revoked_at IS NULL) as tpm_proven,
        COUNT(*) FILTER (WHERE revoked_at IS NOT NULL) as revoked
       FROM device_attestation_identities
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const row = result.rows[0];
    return {
      total: parseInt(row.total),
      byTrustLevel: {
        [IdentityTrustLevel.UNVERIFIED]: parseInt(row.unverified),
        [IdentityTrustLevel.ENROLLED]: parseInt(row.enrolled),
        [IdentityTrustLevel.TPM_PROVEN]: parseInt(row.tpm_proven)
      },
      revoked: parseInt(row.revoked)
    };
  }

  private mapRow(row: any): DeviceAttestationIdentity {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      deviceId: row.device_id,
      akPublicKeyPem: row.ak_public_key_pem,
      akName: row.ak_name,
      ekPublicKeyHash: row.ek_public_key_hash,
      tpmManufacturer: row.tpm_manufacturer,
      tpmFirmwareVersion: row.tpm_firmware_version,
      enrolledAt: row.enrolled_at,
      revokedAt: row.revoked_at,
      revokedReason: row.revoked_reason,
      trustLevel: row.trust_level as IdentityTrustLevel
    };
  }
}
