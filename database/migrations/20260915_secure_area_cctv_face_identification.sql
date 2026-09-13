-- Migration: 20260915_secure_area_cctv_face_identification.sql
-- Description: CCTV Camera to Secure Area (Cash Counter & Locker) mapping and face identification events

CREATE TABLE IF NOT EXISTS secure_area_camera_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  location_id uuid REFERENCES resource_nodes(id) ON DELETE CASCADE,
  camera_id text NOT NULL,
  area_type text NOT NULL CHECK (area_type IN ('cash_counter', 'locker')),
  area_name text NOT NULL CHECK (length(area_name) BETWEEN 1 AND 160),
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, camera_id)
);

CREATE INDEX IF NOT EXISTS secure_area_camera_mappings_branch_idx
  ON secure_area_camera_mappings (tenant_id, branch_id, area_type);

CREATE TABLE IF NOT EXISTS secure_area_cctv_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  location_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  camera_id text NOT NULL,
  area_type text NOT NULL CHECK (area_type IN ('cash_counter', 'locker')),
  area_name text NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('authorized', 'unauthorized_staff', 'unauthorized_person', 'after_hours_breach', 'watchlist_alert')),
  severity text NOT NULL CHECK (severity IN ('INFO', 'P1', 'P2', 'P3')),
  face_person_id uuid REFERENCES face_watchlist_persons(id) ON DELETE SET NULL,
  person_name text,
  employee_code text,
  similarity_score numeric(5,4) NOT NULL DEFAULT 0 CHECK (similarity_score BETWEEN 0 AND 1),
  face_bbox jsonb,
  snapshot_reference text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  alert_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS secure_area_cctv_events_lookup_idx
  ON secure_area_cctv_events (tenant_id, branch_id, area_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS secure_area_cctv_events_verdict_idx
  ON secure_area_cctv_events (tenant_id, verdict, occurred_at DESC);
