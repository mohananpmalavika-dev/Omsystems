DO $$ BEGIN
  CREATE TYPE incident_status AS ENUM ('draft','new','acknowledged','under_triage','assigned','under_investigation','awaiting_info','escalated','police_intimated','insurance_submitted','resolved','closed','reopened','cancelled','false_alarm');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  incident_number text NOT NULL,
  title text NOT NULL,
  description text,
  incident_type text,
  severity text,
  source text,
  branch_id uuid REFERENCES resource_nodes(id),
  occurred_at timestamptz,
  detected_at timestamptz NOT NULL DEFAULT now(),
  reported_by uuid REFERENCES users(id),
  assigned_to uuid REFERENCES users(id),
  status incident_status NOT NULL DEFAULT 'new',
  legal_hold_id uuid REFERENCES recording_legal_holds(id),
  estimated_loss numeric,
  confidentiality text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS incidents_tenant_status_idx ON incidents (tenant_id, status, detected_at DESC);

CREATE TABLE IF NOT EXISTS incident_cameras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incident_video_ranges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  from_at timestamptz NOT NULL,
  to_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS incident_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  status incident_status NOT NULL,
  changed_by uuid REFERENCES users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incident_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  title text NOT NULL,
  owner uuid REFERENCES users(id),
  due_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
