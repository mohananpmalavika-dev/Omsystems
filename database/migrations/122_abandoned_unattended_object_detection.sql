-- ============================================================================
-- Migration 122: Abandoned & Unattended Object Detection Hardening (analytics.abandoned_object)
--
-- Authoritative schema for static foreground blob tracking, sensitive zone monitoring,
-- temporal dwell time analysis, and unattended package incident audits.
-- ============================================================================

-- 1. Create monitored sensitive zones table
CREATE TABLE IF NOT EXISTS abandoned_object_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  camera_id uuid REFERENCES cameras(id) ON DELETE SET NULL,
  zone_name text NOT NULL,
  zone_type text NOT NULL CHECK (zone_type IN (
    'sterile_zone',
    'atm_vestibule',
    'cash_counter',
    'vault_perimeter',
    'emergency_exit',
    'customer_lobby',
    'hallway',
    'baggage_area'
  )),
  polygon jsonb NOT NULL DEFAULT '[]'::jsonb,
  sensitivity text NOT NULL DEFAULT 'high' CHECK (sensitivity IN ('low', 'medium', 'high', 'critical')),
  unattended_threshold_seconds integer NOT NULL DEFAULT 60 CHECK (unattended_threshold_seconds >= 5),
  abandoned_threshold_seconds integer NOT NULL DEFAULT 180 CHECK (abandoned_threshold_seconds >= unattended_threshold_seconds),
  min_blob_area_pixels integer NOT NULL DEFAULT 150 CHECK (min_blob_area_pixels >= 10),
  max_blob_area_pixels integer NOT NULL DEFAULT 50000 CHECK (max_blob_area_pixels >= min_blob_area_pixels),
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abandoned_zones_tenant
  ON abandoned_object_zones (tenant_id);

CREATE INDEX IF NOT EXISTS idx_abandoned_zones_camera
  ON abandoned_object_zones (camera_id);

CREATE INDEX IF NOT EXISTS idx_abandoned_zones_branch
  ON abandoned_object_zones (tenant_id, branch_id);

-- 2. Create abandoned object incident events table
CREATE TABLE IF NOT EXISTS abandoned_object_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  zone_id uuid REFERENCES abandoned_object_zones(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'unattended_object',
    'abandoned_object',
    'removed_object',
    'suspicious_package'
  )),
  object_type text NOT NULL CHECK (object_type IN (
    'backpack',
    'suitcase',
    'box',
    'parcel',
    'handbag',
    'generic_blob',
    'duffel_bag'
  )),
  severity text NOT NULL CHECK (severity IN ('P1', 'P2', 'P3', 'P4')),
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  bounding_box jsonb NOT NULL DEFAULT '{}'::jsonb,
  dwell_time_seconds integer NOT NULL DEFAULT 0 CHECK (dwell_time_seconds >= 0),
  owner_track_id text,
  owner_distance_pixels double precision,
  status text NOT NULL DEFAULT 'detected' CHECK (status IN (
    'detected',
    'investigating',
    'cleared',
    'false_positive',
    'escalated'
  )),
  snapshot_url text,
  thermal_score double precision,
  notes text,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abandoned_events_tenant_time
  ON abandoned_object_events (tenant_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_abandoned_events_camera_time
  ON abandoned_object_events (camera_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_abandoned_events_zone
  ON abandoned_object_events (zone_id);

CREATE INDEX IF NOT EXISTS idx_abandoned_events_status
  ON abandoned_object_events (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_abandoned_events_severity
  ON abandoned_object_events (tenant_id, severity);

-- 3. Create per-camera / per-tenant abandoned object configuration table
CREATE TABLE IF NOT EXISTS abandoned_object_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL UNIQUE REFERENCES cameras(id) ON DELETE CASCADE,
  stationary_pixel_threshold double precision NOT NULL DEFAULT 12.0 CHECK (stationary_pixel_threshold >= 1.0),
  default_unattended_threshold_sec integer NOT NULL DEFAULT 60 CHECK (default_unattended_threshold_sec >= 5),
  default_abandoned_threshold_sec integer NOT NULL DEFAULT 180 CHECK (default_abandoned_threshold_sec >= default_unattended_threshold_sec),
  owner_proximity_threshold_px double precision NOT NULL DEFAULT 120.0 CHECK (owner_proximity_threshold_px >= 10.0),
  debounce_frames integer NOT NULL DEFAULT 3 CHECK (debounce_frames >= 1),
  alert_on_sterile_zone_entry boolean NOT NULL DEFAULT true,
  alert_on_exit_corridor_obstruction boolean NOT NULL DEFAULT true,
  thermal_verification_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abandoned_configs_tenant
  ON abandoned_object_configs (tenant_id);

CREATE INDEX IF NOT EXISTS idx_abandoned_configs_camera
  ON abandoned_object_configs (camera_id);
