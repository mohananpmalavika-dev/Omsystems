CREATE TYPE recording_mode AS ENUM ('continuous', 'motion', 'scheduled', 'event', 'manual');
CREATE TYPE recording_status AS ENUM ('recording', 'scheduled', 'idle', 'error', 'disabled');

CREATE TABLE recording_jobs (
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
CREATE TABLE recording_segments (
  id uuid PRIMARY KEY,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES recording_jobs(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL, ended_at timestamptz NOT NULL,
  storage_path text NOT NULL, size_bytes bigint NOT NULL DEFAULT 0,
  CHECK (ended_at > started_at)
);
CREATE INDEX recording_segments_camera_time_idx ON recording_segments (camera_id, started_at DESC);

CREATE TABLE recording_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  event_type text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(), metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE storage_disks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL, storage_class text NOT NULL CHECK (storage_class IN ('hot', 'cold')), capacity_bytes bigint NOT NULL,
  used_bytes bigint NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'healthy', last_checked_at timestamptz
);
CREATE TABLE recording_retention (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  days integer NOT NULL DEFAULT 180 CHECK (days BETWEEN 1 AND 3650), enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE recording_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), camera_id uuid NOT NULL REFERENCES cameras(id),
  requested_by uuid REFERENCES users(id), from_at timestamptz NOT NULL, to_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued', storage_path text, created_at timestamptz NOT NULL DEFAULT now(), CHECK (to_at > from_at)
);
