import type { Pool } from 'pg';
import { initialProtectionState, ProtectionError, type ProtectionState } from './types.js';

export interface ProtectionRepository {
  read(tenantId: string, branchId: string): Promise<ProtectionState>;
  mutate(tenantId: string, branchId: string, actorId: string, action: string,
    update: (state: ProtectionState) => Promise<unknown>): Promise<ProtectionState>;
  enabledBranches(): Promise<Array<{ tenantId: string; branchId: string }>>;
  audit(tenantId: string, branchId: string, from: string, to: string): Promise<unknown[]>;
}
export class PostgresProtectionRepository implements ProtectionRepository {
  constructor(private readonly getPool: () => Pool | null) {}
  private db(): Pool {
    const db = this.getPool();
    if (!db) throw new ProtectionError('Protection database unavailable', 503);
    return db;
  }
  async read(tenantId: string, branchId: string): Promise<ProtectionState> {
    const result = await this.db().query('SELECT state FROM branch_protection_state WHERE tenant_id=$1 AND branch_id=$2', [tenantId, branchId]);
    return result.rows[0]?.state ?? initialProtectionState();
  }
  async mutate(tenantId: string, branchId: string, actorId: string, action: string,
    update: (state: ProtectionState) => Promise<unknown>): Promise<ProtectionState> {
    const client = await this.db().connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO branch_protection_state(tenant_id,branch_id,state) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [tenantId, branchId, JSON.stringify(initialProtectionState())]);
      const row = await client.query('SELECT state FROM branch_protection_state WHERE tenant_id=$1 AND branch_id=$2 FOR UPDATE', [tenantId, branchId]);
      const state: ProtectionState = row.rows[0].state;
      const detail = await update(state);
      await client.query('UPDATE branch_protection_state SET state=$3,updated_at=now() WHERE tenant_id=$1 AND branch_id=$2', [tenantId, branchId, JSON.stringify(state)]);
      await client.query('INSERT INTO branch_protection_audit(tenant_id,branch_id,actor_id,action,detail) VALUES($1,$2,$3,$4,$5)', [tenantId, branchId, actorId, action, JSON.stringify(detail ?? {})]);
      await client.query('COMMIT');
      return state;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  async enabledBranches() {
    const result = await this.db().query("SELECT tenant_id,branch_id FROM branch_protection_state WHERE state->'policy'->>'enabled'='true'");
    return result.rows.map(row => ({ tenantId: String(row.tenant_id), branchId: String(row.branch_id) }));
  }
  async audit(tenantId: string, branchId: string, from: string, to: string) {
    const result = await this.db().query('SELECT actor_id,action,detail,created_at FROM branch_protection_audit WHERE tenant_id=$1 AND branch_id=$2 AND created_at >= $3 AND created_at < $4 ORDER BY created_at', [tenantId, branchId, from, to]);
    return result.rows;
  }
}
