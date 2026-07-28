CREATE TABLE IF NOT EXISTS operational_health_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  edge_agent_id uuid NOT NULL REFERENCES edge_agents(id) ON DELETE CASCADE,
  device_type text NOT NULL CHECK (device_type IN
    ('branch','edge-agent','recorder','camera','disk','network','ups')),
  device_id text NOT NULL CHECK (length(device_id) BETWEEN 1 AND 200),
  observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN
    ('onvif','cp-plus-adapter','rtsp','system','recording-engine')),
  quality text NOT NULL CHECK (quality IN
    ('verified','estimated','unsupported','unavailable')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS operational_health_latest_idx
  ON operational_health_telemetry
  (tenant_id, branch_id, device_type, device_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS operational_health_observed_idx
  ON operational_health_telemetry (tenant_id, observed_at DESC);

COMMENT ON TABLE operational_health_telemetry IS
  'Immutable normalized Phase 1 device telemetry; unsupported and unavailable values remain explicit.';

CREATE TABLE IF NOT EXISTS operational_health_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES resource_nodes(id) ON DELETE CASCADE,
  policy jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, branch_id)
);

COMMENT ON TABLE operational_health_policies IS
  'Tenant defaults and optional branch overrides for health, staleness and retention thresholds.';
