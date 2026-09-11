import { runSSM } from './run-ssm.mjs';

async function main() {
  const q_qualified = `EXPLAIN (ANALYZE, BUFFERS) SELECT DISTINCT ON (t.tenant_id, t.branch_id, t.device_type, t.device_id) t.tenant_id::text, t.branch_id::text, t.edge_agent_id::text, t.device_type, t.device_id, t.observed_at, t.received_at, t.source, t.quality, t.idempotency_key, t.metrics, t.reason_codes FROM operational_health_telemetry t WHERE t.tenant_id = '00000000-0000-4000-8000-000000000001' ORDER BY t.tenant_id, t.branch_id, t.device_type, t.device_id, t.observed_at DESC, t.received_at DESC;`;
  const script = `docker exec sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid -X -P pager=off -c "${q_qualified}"` ;
  await runSSM(script);
}

main().catch(console.error);
