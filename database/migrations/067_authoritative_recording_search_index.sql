-- 067_authoritative_recording_search_index.sql
-- Authoritative Recording Index, Keyframe Indexing, Storage Tier Locations, and Unified Investigation Events

-- 1. Create recording_keyframes table for instant sub-second scrubbing & seeking
CREATE TABLE IF NOT EXISTS recording_keyframes (
  segment_id uuid NOT NULL REFERENCES recording_segments(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL,
  pts bigint,
  dts bigint,
  byte_offset bigint,
  PRIMARY KEY (segment_id, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_recording_keyframes_lookup
  ON recording_keyframes (segment_id, timestamp ASC);

-- 2. Create recording_segment_locations table for multi-tier storage tracking & audit trail
CREATE TABLE IF NOT EXISTS recording_segment_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id uuid NOT NULL REFERENCES recording_segments(id) ON DELETE CASCADE,
  storage_node_id varchar(128),
  storage_tier varchar(32) NOT NULL DEFAULT 'HOT',
  storage_uri text NOT NULL,
  state varchar(32) NOT NULL DEFAULT 'ONLINE',
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_segment_locations_segment
  ON recording_segment_locations (segment_id);

CREATE INDEX IF NOT EXISTS idx_segment_locations_active
  ON recording_segment_locations (storage_node_id, storage_tier)
  WHERE removed_at IS NULL;

-- 3. Enhance recording_segments table with authoritative logical storage & timing fields
ALTER TABLE recording_segments
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archive_state varchar(32) NOT NULL DEFAULT 'ONLINE',
  ADD COLUMN IF NOT EXISTS storage_uri text,
  ADD COLUMN IF NOT EXISTS device_start_time timestamptz,
  ADD COLUMN IF NOT EXISTS device_end_time timestamptz,
  ADD COLUMN IF NOT EXISTS clock_uncertainty_ms integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bitrate bigint,
  ADD COLUMN IF NOT EXISTS starts_with_keyframe boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS indexed_at timestamptz NOT NULL DEFAULT now();

-- 4. Composite interval-overlap index for high-performance timeline queries:
-- (tenant_id, camera_id, started_at, ended_at)
CREATE INDEX IF NOT EXISTS idx_recording_segments_tenant_camera_interval
  ON recording_segments (tenant_id, camera_id, started_at, ended_at);

-- 5. Create investigation_events table for unified forensic timeline correlation
CREATE TABLE IF NOT EXISTS investigation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  camera_id uuid REFERENCES cameras(id) ON DELETE SET NULL,
  device_id uuid,
  zone_id varchar(128),
  event_type varchar(64) NOT NULL,
  event_subtype varchar(64),
  severity varchar(16) NOT NULL DEFAULT 'INFO',
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  source varchar(64),
  object_type varchar(64),
  object_id varchar(128),
  confidence numeric(5, 4),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  incident_id uuid,
  alert_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investigation_events_tenant_time
  ON investigation_events (tenant_id, start_time DESC, end_time);

CREATE INDEX IF NOT EXISTS idx_investigation_events_camera_time
  ON investigation_events (camera_id, start_time DESC, end_time);

CREATE INDEX IF NOT EXISTS idx_investigation_events_branch_time
  ON investigation_events (branch_id, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_investigation_events_type
  ON investigation_events (event_type, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_investigation_events_zone
  ON investigation_events (tenant_id, zone_id, start_time DESC);
