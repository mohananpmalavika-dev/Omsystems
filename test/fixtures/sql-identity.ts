import { createHash } from "node:crypto";
import type { Pool } from "pg";

/** Stable valid UUIDs make SQL fixtures match the production schema. */
export function fixtureUuid(label: string): string {
  const hex = createHash("sha256").update(`sentinel-test:${label}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function seedSqlIdentity(pool: Pool, input: { tenantId: string; branchIds: string[]; userIds: string[] }) {
  await pool.query(`INSERT INTO tenants (id, slug, name) VALUES ($1, $2, 'Isolated QA tenant') ON CONFLICT (id) DO NOTHING`,
    [input.tenantId, `qa-${input.tenantId}`]);
  const companyId = fixtureUuid(`company-${input.tenantId}`);
  await pool.query(`INSERT INTO resource_nodes (id, tenant_id, node_type, name, path)
    VALUES ($1, $2, 'company', 'QA company', $3::ltree) ON CONFLICT (id) DO NOTHING`,
    [companyId, input.tenantId, companyId.replaceAll("-", "_")]);
  for (const id of input.branchIds) {
    await pool.query(`INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path)
      VALUES ($1, $2, $3, 'branch', 'QA branch', $4::ltree) ON CONFLICT (id) DO NOTHING`,
      [id, input.tenantId, companyId, `${companyId.replaceAll("-", "_")}.${id.replaceAll("-", "_")}`]);
    await pool.query(`INSERT INTO branches (id, tenant_id, name, status)
      VALUES ($1, $2, 'QA branch', 'ACTIVE') ON CONFLICT (id) DO NOTHING`, [id, input.tenantId]);
  }
  for (const id of input.userIds) {
    await pool.query(`INSERT INTO users (id, tenant_id, identity_subject, username, display_name, role, status, active)
      VALUES ($1, $2, $3, $3, 'QA operator', 'operator', 'active', true) ON CONFLICT (id) DO NOTHING`,
      [id, input.tenantId, `qa-${id}`]);
    for (const branchId of input.branchIds) {
      await pool.query(`INSERT INTO user_organizational_assignments (user_id, scope_node_id, tenant_id, is_primary)
        SELECT $1::uuid, $2::uuid, $3::uuid, false WHERE NOT EXISTS (
          SELECT 1 FROM user_organizational_assignments WHERE user_id=$1 AND scope_node_id=$2)`, [id, branchId, input.tenantId]);
    }
  }
}
