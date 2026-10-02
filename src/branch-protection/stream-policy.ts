import { pool } from '../database/pool.js';
import type { ProtectionPolicy } from './types.js';

/** Apply persisted branch policy to every canonical live grant. Recording is untouched. */
export async function protectionStreamProfile(tenantId: string, branchId: string, requested: 'main' | 'sub'): Promise<'main' | 'sub'> {
  if (!pool) return requested;
  const result = await pool.query('SELECT state FROM branch_protection_state WHERE tenant_id=$1 AND branch_id=$2', [tenantId, branchId]);
  const policy = result.rows[0]?.state?.policy as ProtectionPolicy | undefined;
  return policy?.bandwidthMode === 'low' ? 'sub' : requested;
}
