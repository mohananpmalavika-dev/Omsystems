ALTER TABLE secure_area_authorized_persons
  ADD COLUMN IF NOT EXISTS face_person_id uuid REFERENCES face_watchlist_persons(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS secure_area_authorized_person_face_identity_idx
  ON secure_area_authorized_persons (tenant_id, face_person_id) WHERE face_person_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS secure_area_office_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  location_id uuid REFERENCES resource_nodes(id) ON DELETE CASCADE,
  opens_at time NOT NULL DEFAULT '09:00',
  closes_at time NOT NULL DEFAULT '18:00',
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  enabled boolean NOT NULL DEFAULT true,
  UNIQUE NULLS NOT DISTINCT (tenant_id, branch_id, location_id),
  CHECK (opens_at <> closes_at)
);

CREATE TABLE IF NOT EXISTS secure_area_after_hours_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  location_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  area_type text NOT NULL CHECK (area_type IN ('cash_counter', 'locker')),
  area_name text NOT NULL,
  face_person_id uuid REFERENCES face_watchlist_persons(id) ON DELETE SET NULL,
  face_event_id uuid REFERENCES face_recognition_events(id) ON DELETE SET NULL,
  severity text NOT NULL CHECK (severity IN ('P1', 'P2')),
  snapshot_reference text,
  occurred_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'investigating', 'resolved', 'false_alarm')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS secure_area_after_hours_alert_scope_idx
  ON secure_area_after_hours_alerts (tenant_id, branch_id, status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS secure_area_after_hours_alert_dedupe_idx
  ON secure_area_after_hours_alerts (camera_id, area_type, area_name, occurred_at DESC);
