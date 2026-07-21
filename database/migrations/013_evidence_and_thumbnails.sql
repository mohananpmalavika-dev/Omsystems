DO $$ BEGIN
  CREATE TYPE evidence_case_status AS ENUM ('open', 'investigating', 'closed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS evidence_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_number text NOT NULL,
  title text NOT NULL,
  description text,
  status evidence_case_status NOT NULL DEFAULT 'open',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS evidence_cases_tenant_idx ON evidence_cases (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS evidence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES evidence_cases(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('recording','snapshot','exported-video','manifest','document')),
  camera_id uuid REFERENCES cameras(id),
  start_time timestamptz,
  end_time timestamptz,
  description text NOT NULL,
  added_by uuid REFERENCES users(id),
  hash text,
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_items_case_idx ON evidence_items (case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS evidence_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES evidence_cases(id) ON DELETE CASCADE,
  format text NOT NULL CHECK (format IN ('original','mp4','manifest-only')),
  reason text NOT NULL,
  exported_by uuid REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','failed')),
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS evidence_exports_case_idx ON evidence_exports (case_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS evidence_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES evidence_cases(id) ON DELETE CASCADE,
  source_segments jsonb NOT NULL,
  destination_file jsonb NOT NULL,
  timestamp jsonb NOT NULL,
  exported_by uuid REFERENCES users(id),
  signature text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chain_of_custody_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid REFERENCES evidence_cases(id) ON DELETE CASCADE,
  action text NOT NULL,
  performed_by uuid REFERENCES users(id),
  reason text,
  source_ip text,
  event_hash text NOT NULL,
  previous_hash text,
  signature text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS custody_events_evidence_idx ON chain_of_custody_events (evidence_id, created_at ASC);

CREATE TABLE IF NOT EXISTS recording_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id uuid NOT NULL REFERENCES recording_segments(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL,
  reason text NOT NULL,
  notes text,
  operator_id uuid REFERENCES users(id),
  original_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recording_snapshots_camera_idx ON recording_snapshots (camera_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS recording_thumbnails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL,
  storage_path text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recording_thumbnails_camera_time_idx ON recording_thumbnails (camera_id, timestamp DESC);
