import { readFile, writeFile } from 'node:fs/promises';
const files = ['anpr-logistics.routes', 'device-health-correlation.routes', 'nbfc-watchlist.routes'];
for (const name of files) {
  const file = new URL(`../test/${name}.test.ts`, import.meta.url);
  let source = await readFile(file, 'utf8');
  source = source.replace('import { Pool } from "pg";', 'import { Pool } from "pg";\nimport { fixtureUuid, seedSqlIdentity } from "./fixtures/sql-identity.js";');
  for (const label of ['test-tenant-001', 'test-user-001', 'test-branch-001', 'other-tenant-001', 'other-tenant', 'camera-001', 'camera-002', 'test-camera-001', 'test-branch-002']) {
    source = source.replaceAll(`"${label}"`, `fixtureUuid("${label}")`);
  }
  source = source.replace('    app = Fastify();', '    await seedSqlIdentity(pool, { tenantId, branchIds: [branchId], userIds: [userId] });\n\n    app = Fastify();');
  source = source.replace('        userId,\n        tenantId,', '        id: userId,\n        userId,\n        tenantId,');
  // Remove dependent child rows first so each test starts without foreign-key conflicts.
  if (name === 'anpr-logistics.routes') source = source.replace(
    'await pool.query("DELETE FROM anpr_logistics_sessions WHERE tenant_id = $1", [tenantId]);\n    await pool.query("DELETE FROM anpr_detection_points WHERE tenant_id = $1", [tenantId]);\n    await pool.query("DELETE FROM anpr_logistics_violations WHERE tenant_id = $1", [tenantId]);',
    'await pool.query("DELETE FROM anpr_detection_points WHERE tenant_id = $1", [tenantId]);\n    await pool.query("DELETE FROM anpr_logistics_violations WHERE tenant_id = $1", [tenantId]);\n    await pool.query("DELETE FROM anpr_logistics_sessions WHERE tenant_id = $1", [tenantId]);');
  if (name === 'nbfc-watchlist.routes') source = source.replace(
    'await pool.query("DELETE FROM nbfc_watchlist_entries WHERE tenant_id = $1", [tenantId]);\n    await pool.query("DELETE FROM nbfc_watchlist_detections WHERE tenant_id = $1", [tenantId]);',
    'await pool.query("DELETE FROM nbfc_watchlist_detections WHERE tenant_id = $1", [tenantId]);\n    await pool.query("DELETE FROM nbfc_watchlist_entries WHERE tenant_id = $1", [tenantId]);');
  await writeFile(file, source, 'utf8');
}
console.log('Updated three NBFC integration fixtures to use canonical SQL identities.');
