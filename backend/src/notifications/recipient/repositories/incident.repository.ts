/**
 * Incident Repository for Recipient Resolution
 * 
 * Provides tenant-scoped incident lookups for assignee resolution.
 */

import { Pool } from 'pg';
import { IncidentReference } from '../recipient.types.js';
import { IIncidentRepository } from '../recipient-resolver.service.js';

/**
 * IncidentRepository implementation for recipient resolution
 */
export class IncidentRepository implements IIncidentRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Find incident by ID with tenant scope validation
   */
  async findByIdForTenant(
    incidentId: string,
    tenantId: string
  ): Promise<IncidentReference | null> {
    const query = `
      SELECT 
        id,
        tenant_id,
        assigned_user_id,
        branch_id,
        status
      FROM incidents
      WHERE 
        id = $1
        AND tenant_id = $2
      LIMIT 1
    `;

    try {
      const result = await this.pool.query(query, [incidentId, tenantId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToIncidentReference(result.rows[0]);
    } catch (error) {
      throw new Error(
        `Failed to find incident ${incidentId} in tenant ${tenantId}: ${error}`
      );
    }
  }

  /**
   * Find incidents by assignee
   */
  async findByAssignee(params: {
    tenantId: string;
    userId: string;
    status?: string[];
  }): Promise<IncidentReference[]> {
    const statusFilter = params.status
      ? `AND status = ANY($3::text[])`
      : '';

    const query = `
      SELECT 
        id,
        tenant_id,
        assigned_user_id,
        branch_id,
        status
      FROM incidents
      WHERE 
        tenant_id = $1
        AND assigned_user_id = $2
        ${statusFilter}
      ORDER BY created_at DESC
    `;

    const queryParams = params.status
      ? [params.tenantId, params.userId, params.status]
      : [params.tenantId, params.userId];

    try {
      const result = await this.pool.query(query, queryParams);
      return result.rows.map(this.mapRowToIncidentReference);
    } catch (error) {
      throw new Error(
        `Failed to find incidents for user ${params.userId}: ${error}`
      );
    }
  }

  /**
   * Map database row to IncidentReference
   */
  private mapRowToIncidentReference(row: any): IncidentReference {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      assignedUserId: row.assigned_user_id,
      branchId: row.branch_id,
      status: row.status,
    };
  }
}
