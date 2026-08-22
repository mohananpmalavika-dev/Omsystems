/**
 * Branch Repository for Recipient Resolution
 * 
 * Provides tenant-scoped branch lookups for validation.
 */

import { Pool } from 'pg';
import { BranchReference } from '../recipient.types.js';
import { IBranchRepository } from '../recipient-resolver.service.js';

/**
 * BranchRepository implementation
 */
export class BranchRepository implements IBranchRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Find branch by ID with tenant scope validation
   */
  async findByIdForTenant(
    branchId: string,
    tenantId: string
  ): Promise<BranchReference | null> {
    const query = `
      SELECT 
        id,
        tenant_id,
        name,
        status
      FROM branches
      WHERE 
        id = $1
        AND tenant_id = $2
      LIMIT 1
    `;

    try {
      const result = await this.pool.query(query, [branchId, tenantId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToBranchReference(result.rows[0]);
    } catch (error) {
      throw new Error(
        `Failed to find branch ${branchId} in tenant ${tenantId}: ${error}`
      );
    }
  }

  /**
   * Find multiple branches by IDs (batch lookup)
   */
  async findManyByIds(params: {
    tenantId: string;
    branchIds: string[];
  }): Promise<BranchReference[]> {
    if (params.branchIds.length === 0) {
      return [];
    }

    const query = `
      SELECT 
        id,
        tenant_id,
        name,
        status
      FROM branches
      WHERE 
        id = ANY($1::uuid[])
        AND tenant_id = $2
    `;

    try {
      const result = await this.pool.query(query, [
        params.branchIds,
        params.tenantId,
      ]);

      return result.rows.map(this.mapRowToBranchReference);
    } catch (error) {
      throw new Error(
        `Failed to find branches in tenant ${params.tenantId}: ${error}`
      );
    }
  }

  /**
   * Map database row to BranchReference
   */
  private mapRowToBranchReference(row: any): BranchReference {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      status: row.status,
    };
  }
}
