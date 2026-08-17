-- Migration 068: Distributed Runtime State & Leases
-- Eliminates volatile in-memory Maps for critical cluster state

CREATE TABLE IF NOT EXISTS distributed_leases (
  lease_key VARCHAR(255) PRIMARY KEY,
  owner_id VARCHAR(128) NOT NULL,
  token VARCHAR(128) NOT NULL,
  fencing_token BIGINT NOT NULL DEFAULT 1,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_distributed_leases_expires ON distributed_leases(expires_at);

CREATE TABLE IF NOT EXISTS camera_ownership_leases (
  camera_id VARCHAR(128) PRIMARY KEY,
  owner_node_id VARCHAR(128) NOT NULL,
  fencing_token BIGINT NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  lease_ttl_ms INT NOT NULL DEFAULT 30000,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_camera_ownership_expires ON camera_ownership_leases(expires_at);

CREATE TABLE IF NOT EXISTS alert_dedup_windows (
  dedup_key VARCHAR(255) PRIMARY KEY,
  fingerprint VARCHAR(255) NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  occurrence_count INT NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alert_dedup_expires ON alert_dedup_windows(expires_at);

CREATE TABLE IF NOT EXISTS recording_writer_leases (
  camera_id VARCHAR(128) PRIMARY KEY,
  recorder_node_id VARCHAR(128) NOT NULL,
  storage_pool_id VARCHAR(128) NOT NULL,
  fencing_token BIGINT NOT NULL DEFAULT 1,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS cluster_node_registry (
  node_id VARCHAR(128) PRIMARY KEY,
  node_type VARCHAR(64) NOT NULL,
  address VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'HEALTHY',
  assigned_workload INT NOT NULL DEFAULT 0,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_cluster_node_heartbeat ON cluster_node_registry(lease_expires_at);
