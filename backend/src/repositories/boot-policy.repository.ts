/**
 * Boot Attestation Policy Repository
 * Manages known-good PCR baselines and boot integrity policies
 */

import { Pool } from 'pg';
import {
  BootAttestationPolicy,
  PolicyStatus,
  BootPolicyMeasurement
} from '../types/attestation.types';
import { v4 as uuidv4 } from 'uuid';

export class BootPolicyRepository {
  constructor(private pool: Pool) {}

  /**
   * Create new boot policy
   */
  async create(params: {
    tenantId: string;
    name: string;
    description?: string;
    platformType: string;
    hardwareModel?: string;
    firmwareVersion?: string;
    operatingSystem?: string;
    osVersion?: string;
    hashAlgorithm: 'sha256' | 'sha384' | 'sha512';
    requiredPcrs: number[];
    allowedMeasurements: BootPolicyMeasurement[];
    status?: PolicyStatus;
    validFrom?: Date;
    validUntil?: Date;
    createdBy: string;
  }): Promise<BootAttestationPolicy> {
    const id = uuidv4();
    const status = params.status || PolicyStatus.DRAFT;
    const validFrom = params.validFrom || new Date();

    const result = await this.pool.query(
      `INSERT INTO boot_attestation_policies (
        id, tenant_id, name, description,
        platform_type, hardware_model, firmware_version,
        operating_system, os_version,
        hash_algorithm, required_pcrs, allowed_measurements,
        status, version, valid_from, valid_until, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        id,
        params.tenantId,
        params.name,
        params.description || null,
        params.platformType,
        params.hardwareModel || null,
        params.firmwareVersion || null,
        params.operatingSystem || null,
        params.osVersion || null,
        params.hashAlgorithm,
        params.requiredPcrs,
        JSON.stringify(params.allowedMeasurements),
        status,
        1, // version
        validFrom,
        params.validUntil || null,
        params.createdBy
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find policy by ID
   */
  async findById(id: string): Promise<BootAttestationPolicy | null> {
    const result = await this.pool.query(
      `SELECT * FROM boot_attestation_policies WHERE id = $1`,
      [id]
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find active policy for platform
   */
  async findActiveForPlatform(
    tenantId: string,
    platformType: string,
    hardwareModel?: string
  ): Promise<BootAttestationPolicy | null> {
    let query = `
      SELECT * FROM boot_attestation_policies
      WHERE tenant_id = $1
        AND platform_type = $2
        AND status = 'ACTIVE'
        AND valid_from <= NOW()
        AND (valid_until IS NULL OR valid_until > NOW())
    `;
    const params: any[] = [tenantId, platformType];

    if (hardwareModel) {
      params.push(hardwareModel);
      query += ` AND (hardware_model = $${params.length} OR hardware_model IS NULL)`;
    }

    query += ` ORDER BY hardware_model DESC NULLS LAST, version DESC LIMIT 1`;

    const result = await this.pool.query(query, params);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * List policies for tenant
   */
  async listByTenant(
    tenantId: string,
    filter?: {
      status?: PolicyStatus;
      platformType?: string;
    }
  ): Promise<BootAttestationPolicy[]> {
    let query = `SELECT * FROM boot_attestation_policies WHERE tenant_id = $1`;
    const params: any[] = [tenantId];

    if (filter?.status) {
      params.push(filter.status);
      query += ` AND status = $${params.length}`;
    }

    if (filter?.platformType) {
      params.push(filter.platformType);
      query += ` AND platform_type = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await this.pool.query(query, params);
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Update policy status
   */
  async updateStatus(
    id: string,
    status: PolicyStatus
  ): Promise<BootAttestationPolicy | null> {
    const result = await this.pool.query(
      `UPDATE boot_attestation_policies
       SET status = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status]
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Create new version of policy
   */
  async createVersion(
    basePolicy: BootAttestationPolicy,
    updates: Partial<BootAttestationPolicy>,
    createdBy: string
  ): Promise<BootAttestationPolicy> {
    const newVersion = basePolicy.version + 1;
    const id = uuidv4();

    const result = await this.pool.query(
      `INSERT INTO boot_attestation_policies (
        id, tenant_id, name, description,
        platform_type, hardware_model, firmware_version,
        operating_system, os_version,
        hash_algorithm, required_pcrs, allowed_measurements,
        status, version, valid_from, valid_until, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        id,
        basePolicy.tenantId,
        updates.name || basePolicy.name,
        updates.description || basePolicy.description,
        updates.platformType || basePolicy.platformType,
        updates.hardwareModel || basePolicy.hardwareModel,
        updates.firmwareVersion || basePolicy.firmwareVersion,
        updates.operatingSystem || basePolicy.operatingSystem,
        updates.osVersion || basePolicy.osVersion,
        updates.hashAlgorithm || basePolicy.hashAlgorithm,
        updates.requiredPcrs || basePolicy.requiredPcrs,
        JSON.stringify(updates.allowedMeasurements || basePolicy.allowedMeasurements),
        PolicyStatus.DRAFT,
        newVersion,
        new Date(),
        updates.validUntil || null,
        createdBy
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Retire policy
   */
  async retire(id: string): Promise<BootAttestationPolicy | null> {
    return this.updateStatus(id, PolicyStatus.RETIRED);
  }

  /**
   * Activate policy (and deactivate others for same platform)
   */
  async activate(id: string): Promise<BootAttestationPolicy | null> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get the policy being activated
      const policyResult = await client.query(
        `SELECT * FROM boot_attestation_policies WHERE id = $1`,
        [id]
      );

      if (policyResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const policy = this.mapRow(policyResult.rows[0]);

      // Deactivate other active policies for same platform/model
      await client.query(
        `UPDATE boot_attestation_policies
         SET status = 'RETIRED', updated_at = NOW()
         WHERE tenant_id = $1
           AND platform_type = $2
           AND (hardware_model = $3 OR (hardware_model IS NULL AND $3 IS NULL))
           AND status = 'ACTIVE'
           AND id != $4`,
        [policy.tenantId, policy.platformType, policy.hardwareModel, id]
      );

      // Activate this policy
      const result = await client.query(
        `UPDATE boot_attestation_policies
         SET status = 'ACTIVE', updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id]
      );

      await client.query('COMMIT');
      return this.mapRow(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get policy statistics
   */
  async getStatistics(tenantId: string): Promise<{
    total: number;
    byStatus: Record<PolicyStatus, number>;
    platforms: string[];
  }> {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'DRAFT') as draft,
        COUNT(*) FILTER (WHERE status = 'OBSERVING') as observing,
        COUNT(*) FILTER (WHERE status = 'APPROVED') as approved,
        COUNT(*) FILTER (WHERE status = 'ACTIVE') as active,
        COUNT(*) FILTER (WHERE status = 'RETIRED') as retired,
        array_agg(DISTINCT platform_type) as platforms
       FROM boot_attestation_policies
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const row = result.rows[0];
    return {
      total: parseInt(row.total),
      byStatus: {
        [PolicyStatus.DRAFT]: parseInt(row.draft),
        [PolicyStatus.OBSERVING]: parseInt(row.observing),
        [PolicyStatus.APPROVED]: parseInt(row.approved),
        [PolicyStatus.ACTIVE]: parseInt(row.active),
        [PolicyStatus.RETIRED]: parseInt(row.retired)
      },
      platforms: row.platforms.filter((p: any) => p !== null)
    };
  }

  private mapRow(row: any): BootAttestationPolicy {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description,
      platformType: row.platform_type,
      hardwareModel: row.hardware_model,
      firmwareVersion: row.firmware_version,
      operatingSystem: row.operating_system,
      osVersion: row.os_version,
      hashAlgorithm: row.hash_algorithm,
      requiredPcrs: row.required_pcrs,
      allowedMeasurements: JSON.parse(row.allowed_measurements),
      eventLogRules: row.event_log_rules ? JSON.parse(row.event_log_rules) : undefined,
      status: row.status as PolicyStatus,
      version: row.version,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by
    };
  }
}
