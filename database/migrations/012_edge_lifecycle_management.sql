-- Migration 012: First-Class Edge Fleet Lifecycle Management
-- Supports Desired State Reconciliation, Signed Staged Rollouts, Blast Radius, and Digital Twin

CREATE TABLE IF NOT EXISTS edge_agents (
  id text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_node_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  gateway_id text NOT NULL UNIQUE,
  hostname text NOT NULL,
  platform text NOT NULL DEFAULT 'windows',
  architecture text NOT NULL DEFAULT 'x64',
  
  -- Software & Configuration State
  agent_version text NOT NULL DEFAULT '3.7.2',
  desired_agent_version text NOT NULL DEFAULT '3.7.2',
  configuration_version text NOT NULL DEFAULT 'v34',
  desired_configuration_version text NOT NULL DEFAULT 'v34',
  media_mtx_version text NOT NULL DEFAULT '1.11.0',
  
  -- Lifecycle Status
  status text NOT NULL DEFAULT 'ONLINE' CHECK (status IN (
    'ONLINE', 'DEGRADED', 'OFFLINE', 'UPGRADING', 'ROLLING_BACK',
    'FAILED', 'DRIFTED', 'REPLACEMENT_PENDING', 'DECOMMISSIONED'
  )),
  
  -- Heartbeat & Restarts
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  installed_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_restart_at timestamptz,
  last_restart_reason text DEFAULT 'OS_BOOT',
  
  -- Certificates
  certificate_serial text,
  certificate_expires_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS edge_agents_tenant_status_idx 
  ON edge_agents (tenant_id, status);
CREATE INDEX IF NOT EXISTS edge_agents_branch_idx 
  ON edge_agents (branch_node_id);

-- Time-Series Telemetry & Health Metrics
CREATE TABLE IF NOT EXISTS edge_agent_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL REFERENCES edge_agents(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL DEFAULT now(),
  cpu_percent double precision NOT NULL DEFAULT 0.0,
  memory_used_bytes bigint NOT NULL DEFAULT 0,
  memory_total_bytes bigint NOT NULL DEFAULT 0,
  disk_used_bytes bigint NOT NULL DEFAULT 0,
  disk_total_bytes bigint NOT NULL DEFAULT 0,
  service_uptime_seconds bigint NOT NULL DEFAULT 0,
  media_gateway_status text NOT NULL DEFAULT 'HEALTHY',
  ffmpeg_status text NOT NULL DEFAULT 'HEALTHY',
  camera_count integer NOT NULL DEFAULT 0,
  camera_online_count integer NOT NULL DEFAULT 0,
  recording_status text NOT NULL DEFAULT 'HEALTHY',
  clock_offset_ms integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS edge_agent_health_agent_time_idx 
  ON edge_agent_health (agent_id, observed_at DESC);

-- Signed Release Repository
CREATE TABLE IF NOT EXISTS edge_agent_releases (
  id text PRIMARY KEY,
  version text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'windows',
  architecture text NOT NULL DEFAULT 'x64',
  package_url text NOT NULL,
  sha256 text NOT NULL,
  signature text NOT NULL,
  min_upgrade_from text NOT NULL DEFAULT '3.0.0',
  release_notes text,
  status text NOT NULL DEFAULT 'RELEASED' CHECK (status IN ('DRAFT', 'APPROVED', 'RELEASED', 'REVOKED')),
  created_by text NOT NULL,
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Staged Rollout Deployments
CREATE TABLE IF NOT EXISTS edge_deployments (
  id text PRIMARY KEY,
  release_id text NOT NULL REFERENCES edge_agent_releases(id) ON DELETE RESTRICT,
  target_version text NOT NULL,
  current_stage text NOT NULL DEFAULT 'STAGE_1_CANARY_5',
  status text NOT NULL DEFAULT 'ACTIVE',
  total_target_agents integer NOT NULL DEFAULT 0,
  upgraded_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  rolled_back_count integer NOT NULL DEFAULT 0,
  health_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  canary_agent_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Durable Upgrade State Machine Execution Log
CREATE TABLE IF NOT EXISTS edge_upgrade_runs (
  run_id text PRIMARY KEY,
  agent_id text NOT NULL REFERENCES edge_agents(id) ON DELETE CASCADE,
  branch_id text NOT NULL,
  from_version text NOT NULL,
  to_version text NOT NULL,
  status text NOT NULL DEFAULT 'REQUESTED',
  stage_logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  pre_upgrade_baseline jsonb,
  post_upgrade_verification jsonb,
  error_reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS edge_upgrade_runs_agent_idx 
  ON edge_upgrade_runs (agent_id, started_at DESC);
