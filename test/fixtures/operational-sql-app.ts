import Fastify, { type FastifyInstance } from "fastify";
import { Pool } from "pg";
import { ZodError } from "zod";
import { fixtureUuid, seedSqlIdentity } from "./sql-identity.js";

export async function operationalSqlApp(suite: string, register: (app: FastifyInstance, options: { pool: Pool }) => Promise<void>) {
  const url = new URL(process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/sentinel_test');
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/sentinel_test') {
    throw new Error('SQL integration fixtures require a disposable local sentinel_test database.');
  }
  const pool = new Pool({ connectionString: url.toString(), max: 3 });
  const tenantId = fixtureUuid(`${suite}-tenant`), userId = fixtureUuid(`${suite}-user`);
  const branchId = fixtureUuid(`${suite}-branch`), otherBranchId = fixtureUuid(`${suite}-branch-2`);
  await seedSqlIdentity(pool, { tenantId, userIds: [userId], branchIds: [branchId, otherBranchId] });
  const app = Fastify();
  let principal = { id: userId, userId, tenantId, role: 'operator', status: 'active' };
  app.decorateRequest('currentUser');
  app.addHook('preHandler', async request => { request.currentUser = principal as any; });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: 'invalid_request' });
    return reply.code(error.statusCode ?? 500).send({ error: error.message });
  });
  await register(app, { pool });
  const clean = async () => {
    for (const table of ['anpr_logistics_sessions', 'nbfc_watchlist_entries', 'nbfc_watchlist_detections',
      'device_health_snapshots', 'device_critical_issues', 'device_correlated_events']) {
      await pool.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [tenantId]);
    }
  };
  await clean();
  return { app, pool, tenantId, userId, branchId, otherBranchId,
    setRole: (role: string) => { principal = { ...principal, role }; },
    setStatus: (status: string) => { principal = { ...principal, status }; },
    switchTenant: () => { principal = { ...principal, tenantId: fixtureUuid(`${suite}-different-tenant`) }; },
    close: async () => { await clean(); await app.close(); await pool.end(); } };
}
