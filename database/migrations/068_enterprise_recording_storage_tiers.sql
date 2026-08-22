-- Migration: 068_enterprise_recording_storage_tiers.sql
-- Enterprise Storage Architecture: Multi-Tier Storage Abstraction, Health States, Telemetry, and Digital Twin Integration

-- 1. Enterprise Storage Health State Enum
DO $$ BEGIN
  CREATE TYPE enterprise_storage_health_state AS ENUM (
    'HEALTHY',
    'DEGRADED',
    'READ_ONLY',
    'FULL',
    'OFFLINE',
    'REBUILDING'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Enterprise Storage Type Enum
DO $$ BEGIN
  CREATE TYPE enterprise_storage_type AS ENUM (
    'local-disk',
    'nas',
    'san',
    's3',
    'archive'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Enhance recording_storage_nodes Table
ALTER TABLE recording_storage_nodes
  ADD COLUMN IF NOT EXISTS health_state enterprise_storage_health_state NOT NULL DEFAULT 'HEALTHY',
  ADD COLUMN IF NOT EXISTS tier_primary text NOT NULL DEFAULT 'hot' CHECK (tier_primary IN ('hot', 'warm', 'cold', 'archive')),
  ADD COLUMN IF NOT EXISTS read_iops numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS write_iops numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_iops numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS p95_write_latency_ms numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS p95_read_latency_ms numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inode_used_percent numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filesystem_type text DEFAULT 'ext4',
  ADD COLUMN IF NOT EXISTS filesystem_mount_options text,
  ADD COLUMN IF NOT EXISTS is_read_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_writes_attempted bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_writes_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS corrupted_segments_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS segment_failure_rate numeric(5,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS digital_twin_asset_id uuid REFERENCES digital_twin_objects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recording_storage_nodes_health_state
  ON recording_storage_nodes (tenant_id, health_state, last_seen_at DESC);

-- 4. Storage Telemetry History (Time-series metrics for IOPS, latencies, error rates, and capacity)
CREATE TABLE IF NOT EXISTS storage_telemetry_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  storage_node_id uuid NOT NULL REFERENCES recording_storage_nodes(id) ON DELETE CASCADE,
  health_state enterprise_storage_health_state NOT NULL,
  capacity_bytes bigint NOT NULL,
  used_bytes bigint NOT NULL,
  available_bytes bigint NOT NULL,
  usage_percent numeric(5,2) NOT NULL,
  read_iops numeric(10,2) NOT NULL DEFAULT 0,
  write_iops numeric(10,2) NOT NULL DEFAULT 0,
  write_latency_ms numeric(10,2) NOT NULL DEFAULT 0,
  read_latency_ms numeric(10,2) NOT NULL DEFAULT 0,
  p95_write_latency_ms numeric(10,2) NOT NULL DEFAULT 0,
  p95_read_latency_ms numeric(10,2) NOT NULL DEFAULT 0,
  segment_failure_rate numeric(5,4) NOT NULL DEFAULT 0,
  temperature_celsius numeric(5,2),
  smart_summary jsonb,
  raid_summary jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storage_telemetry_node_time
  ON storage_telemetry_history (storage_node_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_storage_telemetry_tenant_time
  ON storage_telemetry_history (tenant_id, recorded_at DESC);

-- 5. Storage Tier Migration Tasks (HOT -> WARM -> ARCHIVE lifecycle orchestration)
CREATE TABLE IF NOT EXISTS storage_tier_migration_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  segment_id uuid NOT NULL REFERENCES recording_segments(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES recording_storage_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES recording_storage_nodes(id) ON DELETE CASCADE,
  source_tier text NOT NULL,
  target_tier text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED')),
  bytes_transferred bigint NOT NULL DEFAULT 0,
  total_bytes bigint NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storage_migration_status
  ON storage_tier_migration_tasks (tenant_id, status, created_at ASC);
