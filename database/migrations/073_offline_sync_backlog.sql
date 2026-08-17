-- Migration 073: Offline Edge Survivability & Store-and-Forward Synchronization
-- Tables for Branch Connectivity Status, Cloud Ingest Journal, and Backlog Telemetry

CREATE TABLE IF NOT EXISTS branch_connectivity_status (
  branch_id VARCHAR(128) PRIMARY KEY,
  branch_name VARCHAR(128) NOT NULL,
  connectivity_state VARCHAR(32) NOT NULL DEFAULT 'ONLINE',
  last_cloud_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  local_recording_active BOOLEAN NOT NULL DEFAULT TRUE,
  local_health_active BOOLEAN NOT NULL DEFAULT TRUE,
  queued_items_count INT NOT NULL DEFAULT 0,
  p1_backlog_count INT NOT NULL DEFAULT 0,
  metadata_backlog_count INT NOT NULL DEFAULT 0,
  audit_backlog_count INT NOT NULL DEFAULT 0,
  events_backlog_count INT NOT NULL DEFAULT 0,
  health_backlog_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branch_connectivity ON branch_connectivity_status(connectivity_state, updated_at DESC);

CREATE TABLE IF NOT EXISTS cloud_sync_ingest_journal (
  item_id VARCHAR(128) PRIMARY KEY,
  branch_id VARCHAR(128) NOT NULL,
  item_type VARCHAR(64) NOT NULL,
  priority INT NOT NULL,
  payload JSONB NOT NULL,
  source_timestamp TIMESTAMPTZ NOT NULL,
  checksum VARCHAR(128) NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cloud_sync_branch_time ON cloud_sync_ingest_journal(branch_id, source_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_sync_checksum ON cloud_sync_ingest_journal(checksum);

CREATE TABLE IF NOT EXISTS branch_backlog_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id VARCHAR(128) NOT NULL,
  outage_duration_seconds INT NOT NULL DEFAULT 0,
  items_spooled INT NOT NULL DEFAULT 0,
  items_synced INT NOT NULL DEFAULT 0,
  items_dropped_quota INT NOT NULL DEFAULT 0,
  gaps_healed_count INT NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backlog_metrics_branch ON branch_backlog_metrics(branch_id, recorded_at DESC);
