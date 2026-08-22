/**
 * Escalation Policy Service
 * 
 * Manages escalation policies with recursive recipient resolution.
 */

import { Pool } from 'pg';
import { EscalationPolicy, RecipientSelector } from '../recipient.types.js';
import { IEscalationPolicyService } from '../recipient-resolver.service.js';

/**
 * EscalationPolicyService implementation
 */
export class EscalationPolicyService implements IEscalationPolicyService {
  constructor(private readonly pool: Pool) {}

  /**
   * Find escalation policy by ID with tenant scope
   */
  async findForTenant(
    policyId: string,
    tenantId: string
  ): Promise<EscalationPolicy | null> {
    const query = `
      SELECT 
        id,
        tenant_id,
        name,
        enabled,
        levels
      FROM escalation_policies
      WHERE 
        id = $1
        AND tenant_id = $2
      LIMIT 1
    `;

    try {
      const result = await this.pool.query(query, [policyId, tenantId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToPolicy(result.rows[0]);
    } catch (error) {
      throw new Error(
        `Failed to find escalation policy ${policyId}: ${error}`
      );
    }
  }

  /**
   * Find all policies for a tenant
   */
  async findAllForTenant(tenantId: string): Promise<EscalationPolicy[]> {
    const query = `
      SELECT 
        id,
        tenant_id,
        name,
        enabled,
        levels
      FROM escalation_policies
      WHERE tenant_id = $1
      ORDER BY name
    `;

    try {
      const result = await this.pool.query(query, [tenantId]);
      return result.rows.map(this.mapRowToPolicy);
    } catch (error) {
      throw new Error(`Failed to find escalation policies: ${error}`);
    }
  }

  /**
   * Create escalation policy
   */
  async create(
    policy: Omit<EscalationPolicy, 'id'>
  ): Promise<EscalationPolicy> {
    const query = `
      INSERT INTO escalation_policies (
        id,
        tenant_id,
        name,
        enabled,
        levels,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        $1, $2, $3, $4, NOW(), NOW()
      )
      RETURNING *
    `;

    try {
      const result = await this.pool.query(query, [
        policy.tenantId,
        policy.name,
        policy.enabled,
        JSON.stringify(policy.levels),
      ]);

      return this.mapRowToPolicy(result.rows[0]);
    } catch (error) {
      throw new Error(`Failed to create escalation policy: ${error}`);
    }
  }

  /**
   * Update escalation policy
   */
  async update(
    policyId: string,
    tenantId: string,
    updates: Partial<EscalationPolicy>
  ): Promise<EscalationPolicy | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }

    if (updates.enabled !== undefined) {
      fields.push(`enabled = $${paramIndex++}`);
      values.push(updates.enabled);
    }

    if (updates.levels !== undefined) {
      fields.push(`levels = $${paramIndex++}`);
      values.push(JSON.stringify(updates.levels));
    }

    if (fields.length === 0) {
      return this.findForTenant(policyId, tenantId);
    }

    fields.push('updated_at = NOW()');
    values.push(policyId, tenantId);

    const query = `
      UPDATE escalation_policies
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex++}
        AND tenant_id = $${paramIndex++}
      RETURNING *
    `;

    try {
      const result = await this.pool.query(query, values);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToPolicy(result.rows[0]);
    } catch (error) {
      throw new Error(`Failed to update escalation policy: ${error}`);
    }
  }

  /**
   * Delete escalation policy
   */
  async delete(policyId: string, tenantId: string): Promise<boolean> {
    const query = `
      DELETE FROM escalation_policies
      WHERE id = $1 AND tenant_id = $2
    `;

    try {
      const result = await this.pool.query(query, [policyId, tenantId]);
      return (result.rowCount || 0) > 0;
    } catch (error) {
      throw new Error(`Failed to delete escalation policy: ${error}`);
    }
  }

  /**
   * Map database row to EscalationPolicy
   */
  private mapRowToPolicy(row: any): EscalationPolicy {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      enabled: row.enabled,
      levels: row.levels,
    };
  }
}
