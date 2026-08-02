-- Unique gateway enrollment, revocation, audited command delivery and signed OTA releases.

ALTER TABLE edge_agents
  ADD COLUMN IF NOT EXISTS device_uuid text,
  ADD COLUMN IF NOT EXISTS credential_hash bytea,
  ADD COLUMN IF NOT EXISTS credential_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS credential_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS command_public_key text;

CREATE UNIQUE INDEX IF NOT EXISTS edge_agents_device_uuid_idx
  ON edge_agents (device_uuid) WHERE device_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS edge_agents_active_credential_idx
  ON edge_agents (id) WHERE credential_hash IS NOT NULL AND credential_revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS edge_activation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_node_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  agent_name text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS edge_activation_tokens_branch_idx
  ON edge_activation_tokens (branch_node_id, created_at DESC);
CREATE INDEX IF NOT EXISTS edge_activation_tokens_active_idx
  ON edge_activation_tokens (expires_at)
  WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS edge_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_node_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  edge_agent_id uuid NOT NULL REFERENCES edge_agents(id) ON DELETE CASCADE,
  command_type text NOT NULL CHECK (command_type IN (
    'rediscover', 'restart-media', 'restart-agent', 'probe-camera',
    'probe-recorder', 'collect-logs', 'apply-update'
    , 'update-credentials'
  )),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'running', 'succeeded', 'failed', 'cancelled'
  )),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error text,
  requested_by uuid NOT NULL REFERENCES users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS edge_commands_claim_idx
  ON edge_commands (edge_agent_id, requested_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS edge_commands_recovery_idx
  ON edge_commands (edge_agent_id, started_at) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS edge_commands_branch_history_idx
  ON edge_commands (branch_node_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS edge_update_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  artifact_url text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  signature text NOT NULL,
  notes text NOT NULL DEFAULT '',
  rollout_percentage integer NOT NULL DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
  enabled boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS edge_update_releases_rollout_idx
  ON edge_update_releases (enabled, created_at DESC);

COMMENT ON COLUMN edge_agents.credential_hash IS
  'SHA-256 of a random per-gateway bearer credential. The bearer value is returned once at activation.';
COMMENT ON TABLE edge_commands IS
  'Durable, audited gateway command queue claimed with FOR UPDATE SKIP LOCKED.';
COMMENT ON TABLE edge_update_releases IS
  'Signed immutable OTA manifests; artifacts are verified again by the gateway before staging.';
