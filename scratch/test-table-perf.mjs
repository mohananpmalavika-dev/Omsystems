import { runSSM } from './run-ssm.mjs';

async function main() {
  const sql = `
CREATE TABLE IF NOT EXISTS operational_health_latest (
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  edge_agent_id uuid NOT NULL,
  device_type text NOT NULL,
  device_id text NOT NULL,
  observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  source text NOT NULL,
  quality text NOT NULL,
  idempotency_key text NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  PRIMARY KEY (tenant_id, branch_id, device_type, device_id)
);

CREATE INDEX IF NOT EXISTS operational_health_latest_tenant_branch_idx
  ON operational_health_latest (tenant_id, branch_id);

CREATE INDEX IF NOT EXISTS operational_health_latest_observed_idx
  ON operational_health_latest (tenant_id, observed_at DESC);

SET work_mem = '128MB';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
)
SELECT DISTINCT ON (tenant_id, branch_id, device_type, device_id)
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
FROM operational_health_telemetry
ORDER BY tenant_id, branch_id, device_type, device_id, observed_at DESC, received_at DESC
ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE SET
  edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = EXCLUDED.observed_at,
  received_at = EXCLUDED.received_at,
  source = EXCLUDED.source,
  quality = EXCLUDED.quality,
  idempotency_key = EXCLUDED.idempotency_key,
  metrics = EXCLUDED.metrics,
  reason_codes = EXCLUDED.reason_codes
WHERE EXCLUDED.observed_at >= operational_health_latest.observed_at;

CREATE OR REPLACE FUNCTION trg_sync_operational_health_latest()
RETURNS TRIGGER AS \\$\\$
BEGIN
  INSERT INTO operational_health_latest (
    tenant_id, branch_id, edge_agent_id, device_type, device_id,
    observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
  )
  VALUES (
    NEW.tenant_id, NEW.branch_id, NEW.edge_agent_id, NEW.device_type, NEW.device_id,
    NEW.observed_at, NEW.received_at, NEW.source, NEW.quality, NEW.idempotency_key, NEW.metrics, NEW.reason_codes
  )
  ON CONFLICT (tenant_id, branch_id, device_type, device_id)
  DO UPDATE SET
    edge_agent_id = EXCLUDED.edge_agent_id,
    observed_at = EXCLUDED.observed_at,
    received_at = EXCLUDED.received_at,
    source = EXCLUDED.source,
    quality = EXCLUDED.quality,
    idempotency_key = EXCLUDED.idempotency_key,
    metrics = EXCLUDED.metrics,
    reason_codes = EXCLUDED.reason_codes
  WHERE EXCLUDED.observed_at >= operational_health_latest.observed_at;
  RETURN NEW;
END;
\\$\\$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_operational_health_telemetry_latest ON operational_health_telemetry;
CREATE TRIGGER trg_operational_health_telemetry_latest
AFTER INSERT ON operational_health_telemetry
FOR EACH ROW
EXECUTE FUNCTION trg_sync_operational_health_latest();

SELECT count(*) as latest_count FROM operational_health_latest;

EXPLAIN (ANALYZE, BUFFERS)
SELECT tenant_id::text, branch_id::text, edge_agent_id::text, device_type,
       device_id, observed_at, received_at, source, quality, idempotency_key,
       metrics, reason_codes
FROM operational_health_latest
WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
ORDER BY tenant_id, branch_id, device_type, device_id;
`;

  const script = `docker exec sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid -X -P pager=off -c "${sql.replace(/"/g, '\\"')}"`;
  await runSSM(script);
}

main().catch(console.error);
