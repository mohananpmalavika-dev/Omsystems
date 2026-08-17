-- 066_bulletproof_recording_engine.sql
-- Enterprise-grade bulletproof VMS recording engine schema enhancements

-- 1. Create recording_gaps table for audit compliance, SLA tracking, and forensic analysis
CREATE TABLE IF NOT EXISTS recording_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  reason varchar(64) NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_recording_gaps_camera ON recording_gaps (camera_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_recording_gaps_tenant_branch ON recording_gaps (tenant_id, branch_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_recording_gaps_unresolved ON recording_gaps (camera_id) WHERE resolved_at IS NULL;

-- 2. Enhance recording_segments with media timing, keyframes, checksums, and states
ALTER TABLE recording_segments
  ADD COLUMN IF NOT EXISTS first_pts bigint,
  ADD COLUMN IF NOT EXISTS last_pts bigint,
  ADD COLUMN IF NOT EXISTS first_dts bigint,
  ADD COLUMN IF NOT EXISTS last_dts bigint,
  ADD COLUMN IF NOT EXISTS time_base varchar(32),
  ADD COLUMN IF NOT EXISTS source_start timestamptz,
  ADD COLUMN IF NOT EXISTS source_end timestamptz,
  ADD COLUMN IF NOT EXISTS clock_offset_ms integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timestamp_health varchar(32) DEFAULT 'HEALTHY',
  ADD COLUMN IF NOT EXISTS keyframe_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS keyframe_index jsonb,
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer,
  ADD COLUMN IF NOT EXISTS fps numeric(8, 3),
  ADD COLUMN IF NOT EXISTS duration_ms bigint,
  ADD COLUMN IF NOT EXISTS health varchar(32) NOT NULL DEFAULT 'HEALTHY',
  ADD COLUMN IF NOT EXISTS segment_state varchar(32) NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN IF NOT EXISTS manifest_json jsonb;

-- Ensure indexes for time-range lookups and forensic queries
CREATE INDEX IF NOT EXISTS idx_recording_segments_camera_time_range
  ON recording_segments (camera_id, started_at, ended_at);

CREATE INDEX IF NOT EXISTS idx_recording_segments_health_state
  ON recording_segments (health, segment_state);

-- Unique index on camera + storage path for idempotent upserting
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_recording_camera_storage_path' AND n.nspname = 'public'
  ) THEN
    CREATE UNIQUE INDEX idx_recording_camera_storage_path ON recording_segments (camera_id, storage_path);
  END IF;
END $$;
