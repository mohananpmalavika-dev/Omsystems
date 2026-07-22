DO $$ BEGIN
  CREATE TYPE recording_mode AS ENUM ('continuous', 'motion', 'scheduled', 'event', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE recording_status AS ENUM ('recording', 'scheduled', 'idle', 'error', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS recording_jobs (
  id uuid PRIMARY KEY,
  camera_id uuid NOT NULL UNIQUE REFERENCES cameras(id) ON DELETE CASCADE,
  mode recording_mode NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  status recording_status NOT NULL DEFAULT 'idle',
  retention_days integer NOT NULL DEFAULT 180 CHECK (retention_days BETWEEN 1 AND 3650),
  schedule jsonb,
  post_roll_seconds integer NOT NULL DEFAULT 30 CHECK (post_roll_seconds BETWEEN 0 AND 3600),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE recording_jobs
  ADD COLUMN IF NOT EXISTS segment_duration_seconds integer NOT NULL DEFAULT 60
    CHECK (segment_duration_seconds BETWEEN 10 AND 300),
  ADD COLUMN IF NOT EXISTS hot_retention_days integer NOT NULL DEFAULT 30
    CHECK (hot_retention_days BETWEEN 0 AND 3650),
  ADD COLUMN IF NOT EXISTS warm_retention_days integer NOT NULL DEFAULT 60
    CHECK (warm_retention_days BETWEEN 0 AND 3650),
  ADD COLUMN IF NOT EXISTS cold_retention_days integer NOT NULL DEFAULT 90
    CHECK (cold_retention_days BETWEEN 0 AND 3650),
  ADD COLUMN IF NOT EXISTS max_bitrate_kbps integer
    CHECK (max_bitrate_kbps IS NULL OR max_bitrate_kbps BETWEEN 64 AND 100000),
  ADD COLUMN IF NOT EXISTS pre_roll_seconds integer NOT NULL DEFAULT 30
    CHECK (pre_roll_seconds BETWEEN 0 AND 3600),
  ADD COLUMN IF NOT EXISTS min_motion_duration_seconds integer NOT NULL DEFAULT 0
    CHECK (min_motion_duration_seconds BETWEEN 0 AND 86400),
  ADD COLUMN IF NOT EXISTS motion_confidence_threshold numeric(5,4) NOT NULL DEFAULT 0
    CHECK (motion_confidence_threshold BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS cooldown_seconds integer NOT NULL DEFAULT 60
    CHECK (cooldown_seconds BETWEEN 0 AND 86400),
  ADD COLUMN IF NOT EXISTS max_event_duration_seconds integer NOT NULL DEFAULT 0
    CHECK (max_event_duration_seconds BETWEEN 0 AND 86400),
  ADD COLUMN IF NOT EXISTS storage_node_external_id text,
  ADD COLUMN IF NOT EXISTS trigger_event_types text[],
  ADD COLUMN IF NOT EXISTS critical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS backup_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS automatic_deletion_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS evidence_protection boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS record_main_stream boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS recording_segments (
  id uuid PRIMARY KEY,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES recording_jobs(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL, ended_at timestamptz NOT NULL,
  storage_path text NOT NULL, size_bytes bigint NOT NULL DEFAULT 0,
  CHECK (ended_at > started_at)
);
ALTER TABLE recording_segments
  ADD COLUMN IF NOT EXISTS storage_node_external_id text NOT NULL DEFAULT 'local-recorder',
  ADD COLUMN IF NOT EXISTS storage_tier text NOT NULL DEFAULT 'hot'
    CHECK (storage_tier IN ('hot', 'warm', 'cold')),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'moving', 'deleted', 'error')),
  ADD COLUMN IF NOT EXISTS checksum_sha256 text
    CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[a-f0-9]{64}$'),
  ADD COLUMN IF NOT EXISTS codec text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS recording_segments_camera_time_idx ON recording_segments (camera_id, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS recording_segments_camera_path_uidx
  ON recording_segments (camera_id, storage_path);
CREATE TABLE IF NOT EXISTS recording_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  event_type text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(), metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS recording_storage_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  scope_node_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  name text NOT NULL,
  supported_tiers text[] NOT NULL DEFAULT ARRAY['hot']::text[],
  capacity_bytes bigint NOT NULL CHECK (capacity_bytes >= 0),
  used_bytes bigint NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
  available_bytes bigint NOT NULL DEFAULT 0 CHECK (available_bytes >= 0),
  status text NOT NULL DEFAULT 'healthy'
    CHECK (status IN ('healthy', 'warning', 'critical', 'offline')),
  temperature_celsius numeric(5,2),
  write_mbps numeric(10,2),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id),
  CHECK (supported_tiers <@ ARRAY['hot', 'warm', 'cold']::text[])
);
CREATE INDEX IF NOT EXISTS recording_storage_nodes_status_idx
  ON recording_storage_nodes (tenant_id, status, last_seen_at DESC);
CREATE TABLE IF NOT EXISTS recording_retention (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  days integer NOT NULL DEFAULT 180 CHECK (days BETWEEN 1 AND 3650), enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS recording_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), camera_id uuid NOT NULL REFERENCES cameras(id),
  requested_by uuid REFERENCES users(id), from_at timestamptz NOT NULL, to_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued', storage_path text, created_at timestamptz NOT NULL DEFAULT now(), CHECK (to_at > from_at)
);
CREATE TABLE IF NOT EXISTS recording_legal_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  from_at timestamptz NOT NULL,
  to_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 1000),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  released_by uuid REFERENCES users(id),
  released_at timestamptz,
  CHECK (to_at > from_at),
  CHECK ((released_by IS NULL) = (released_at IS NULL))
);
CREATE INDEX IF NOT EXISTS recording_legal_holds_active_idx
  ON recording_legal_holds (camera_id, from_at, to_at)
  WHERE released_at IS NULL;
CREATE TABLE IF NOT EXISTS recording_replication_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  segment_id uuid NOT NULL REFERENCES recording_segments(id) ON DELETE CASCADE,
  destination_node_id uuid REFERENCES recording_storage_nodes(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'copying', 'complete', 'failed')),
  priority integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 1 AND 1000),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (segment_id, destination_node_id)
);
CREATE INDEX IF NOT EXISTS recording_replication_queue_idx
  ON recording_replication_jobs (status, priority, next_attempt_at)
  WHERE status IN ('queued', 'failed');
CREATE TABLE IF NOT EXISTS recording_health_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid REFERENCES cameras(id) ON DELETE CASCADE,
  storage_node_external_id text,
  event_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS recording_health_events_open_idx
  ON recording_health_events (tenant_id, severity, occurred_at DESC)
  WHERE resolved_at IS NULL;
