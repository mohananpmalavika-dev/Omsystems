CREATE TABLE IF NOT EXISTS live_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 160),
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  priority text NOT NULL CHECK (priority IN ('P1', 'P2', 'P3', 'P4', 'P5')),
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'acknowledged', 'investigating', 'escalated', 'resolved', 'false-alarm')),
  occurred_at timestamptz NOT NULL,
  recording_from timestamptz NOT NULL,
  recording_to timestamptz NOT NULL,
  pre_roll_seconds integer NOT NULL CHECK (pre_roll_seconds BETWEEN 0 AND 120),
  post_roll_seconds integer NOT NULL CHECK (post_roll_seconds BETWEEN 30 AND 600),
  primary_bookmark_id uuid,
  legal_hold_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (recording_to > recording_from)
);

CREATE INDEX IF NOT EXISTS live_incidents_camera_status_idx
  ON live_incidents (camera_id, status, occurred_at DESC);

CREATE TABLE IF NOT EXISTS live_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES users(id),
  bookmarked_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (reason IN (
    'suspicious-activity', 'cash-discrepancy', 'unauthorized-entry',
    'customer-dispute', 'equipment-failure', 'safety-incident', 'other'
  )),
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  incident_id uuid REFERENCES live_incidents(id) ON DELETE SET NULL,
  recording_segment_id uuid REFERENCES recording_segments(id) ON DELETE SET NULL,
  snapshot_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS live_bookmarks_camera_time_idx
  ON live_bookmarks (camera_id, bookmarked_at DESC);

ALTER TABLE live_incidents
  DROP CONSTRAINT IF EXISTS live_incidents_primary_bookmark_id_fkey,
  ADD CONSTRAINT live_incidents_primary_bookmark_id_fkey
    FOREIGN KEY (primary_bookmark_id) REFERENCES live_bookmarks(id) ON DELETE SET NULL;

ALTER TABLE recording_legal_holds
  ADD COLUMN IF NOT EXISTS incident_id uuid REFERENCES live_incidents(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS recording_legal_holds_incident_uidx
  ON recording_legal_holds (incident_id) WHERE incident_id IS NOT NULL;
