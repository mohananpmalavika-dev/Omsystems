// Isolated PostgreSQL/WASM verification; never connects to an external database.
// QA dependency: npm install --prefix tmp/camera-recovery-migration-qa --no-save --package-lock=false --ignore-scripts @electric-sql/pglite
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '../tmp/camera-recovery-migration-qa/node_modules/@electric-sql/pglite/dist/index.js';
import { EdgeOperationsRepository } from '../src/database/edge-operations-repository.ts';

const db = new PGlite();
try {
  const initial = await readFile('database/migrations/048_edge_gateway_operations.sql', 'utf8');
  const start = initial.indexOf('CREATE TABLE IF NOT EXISTS edge_commands (');
  const end = initial.indexOf('CREATE INDEX IF NOT EXISTS edge_commands_claim_idx', start);
  assert.ok(start >= 0 && end > start);
  await db.exec(`
    CREATE TABLE tenants (id uuid PRIMARY KEY);
    CREATE TABLE resource_nodes (id uuid PRIMARY KEY, tenant_id uuid);
    CREATE TABLE users (id uuid PRIMARY KEY);
    CREATE TABLE edge_agents (id uuid PRIMARY KEY, tenant_id uuid, branch_node_id uuid, credential_revoked_at timestamptz);
    CREATE TABLE edge_agent_branch_assignments (edge_agent_id uuid, branch_node_id uuid, tenant_id uuid);
    ${initial.slice(start, end)}
  `);
  const tenant = randomUUID(), branch = randomUUID(), agent = randomUUID(), user = randomUUID();
  await db.query('INSERT INTO tenants VALUES ($1)', [tenant]);
  await db.query('INSERT INTO resource_nodes VALUES ($1,$2)', [branch, tenant]);
  await db.query('INSERT INTO users VALUES ($1)', [user]);
  await db.query('INSERT INTO edge_agents VALUES ($1,$2,$3,NULL)', [agent, tenant, branch]);
  const repository = new EdgeOperationsRepository({ query: (sql, values) => db.query(sql, values) });
  const request = { edgeAgentId: agent, payload: { branchId: branch, cameraId: randomUUID() }, requestedBy: user };
  const original = await repository.createCommand({ ...request, type: 'probe-camera' });
  await assert.rejects(repository.createCommand({ ...request, type: 'recover-camera' }), {
    code: '23514', constraint: 'edge_commands_command_type_check',
  });
  const migration = await readFile('database/migrations/20261006_edge_camera_recovery_commands.sql', 'utf8');
  await db.exec('BEGIN');
  await db.exec(migration);
  await db.exec('COMMIT');
  const model = await readFile('src/domain/models.ts', 'utf8');
  const declared = /export type EdgeCommandType\s*=([\s\S]*?);/.exec(model)?.[1];
  assert.ok(declared);
  const types = [...declared.matchAll(/"([^"]+)"/g)].map(match => match[1]);
  for (const type of types) {
    const created = await repository.createCommand({ ...request, type });
    assert.equal(created.type, type);
    assert.equal(created.status, 'queued');
  }
  await assert.rejects(repository.createCommand({ ...request, type: 'force-online' }), {
    code: '23514', constraint: 'edge_commands_command_type_check',
  });
  assert.deepEqual(await db.query('SELECT status,payload FROM edge_commands WHERE id=$1', [original.id]).then(result => result.rows[0]), {
    status: original.status, payload: original.payload,
  });
  await db.exec(migration);
  assert.equal((await repository.createCommand({ ...request, type: 'recover-camera' })).type, 'recover-camera');
  console.log(JSON.stringify({ verified: true, reproducedOriginalConstraintFailure: true, recoveryInsertPassed: true, runtimeCommandsVerified: types.length, existingRowsPreserved: true, invalidCommandsRejected: true, repeatMigrationPassed: true, externalDatabaseConnections: 0 }));
} finally { await db.close(); }
