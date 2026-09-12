-- ============================================================================
-- Migration 120: Camera Tamper & Defocus Detection Hardening (analytics.camera_tamper)
--
-- Authoritative schema for edge-based statistical frame analysis detecting
-- camera movement, blinding, lens covering/occlusion, defocus/blur, and spray paint.
-- ============================================================================

-- 1. Create camera tamper events table
CREATE TABLE IF NOT EXISTS camera_tamper_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  tamper_type text NOT NULL CHECK (tamper_type IN ('blinding', 'covering', 'movement', 'defocus', 'spray')),
  severity text NOT NULL CHECK (severity IN ('P1', 'P2', 'P3', 'P4')),
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'detected' CHECK (status IN ('detected', 'acknowledged', 'resolved', 'false_positive')),
  snapshot_url text,
  baseline_snapshot_url text,
  notes text,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tamper_events_tenant_time
  ON camera_tamper_events (tenant_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_tamper_events_camera_time
  ON camera_tamper_events (camera_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_tamper_events_type_severity
  ON camera_tamper_events (tenant_id, tamper_type, severity);

CREATE INDEX IF NOT EXISTS idx_tamper_events_status
  ON camera_tamper_events (tenant_id, status);

-- 2. Create camera tamper baselines table
CREATE TABLE IF NOT EXISTS camera_tamper_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL UNIQUE REFERENCES cameras(id) ON DELETE CASCADE,
  baseline_luminance double precision NOT NULL,
  baseline_variance double precision NOT NULL,
  baseline_edge_density double precision NOT NULL,
  baseline_entropy double precision NOT NULL,
  baseline_laplacian_variance double precision NOT NULL,
  reference_frame_hash text,
  reference_histogram jsonb NOT NULL DEFAULT '[]'::jsonb,
  calibrated_at timestamptz NOT NULL DEFAULT now(),
  sample_frames_count integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tamper_baselines_tenant
  ON camera_tamper_baselines (tenant_id);

CREATE INDEX IF NOT EXISTS idx_tamper_baselines_camera
  ON camera_tamper_baselines (camera_id);

-- 3. Create camera tamper configurations table
CREATE TABLE IF NOT EXISTS camera_tamper_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL UNIQUE REFERENCES cameras(id) ON DELETE CASCADE,
  sensitivity double precision NOT NULL DEFAULT 0.8 CHECK (sensitivity >= 0 AND sensitivity <= 1),
  defocus_threshold double precision NOT NULL DEFAULT 100.0,
  blinding_threshold double precision NOT NULL DEFAULT 240.0,
  covering_threshold double precision NOT NULL DEFAULT 15.0,
  movement_threshold double precision NOT NULL DEFAULT 0.65,
  spray_threshold double precision NOT NULL DEFAULT 0.70,
  debounce_frames integer NOT NULL DEFAULT 5 CHECK (debounce_frames >= 1),
  auto_recalibrate_hours integer NOT NULL DEFAULT 24,
  alert_on_defocus boolean NOT NULL DEFAULT true,
  alert_on_blinding boolean NOT NULL DEFAULT true,
  alert_on_covering boolean NOT NULL DEFAULT true,
  alert_on_movement boolean NOT NULL DEFAULT true,
  alert_on_spray boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tamper_configs_tenant
  ON camera_tamper_configs (tenant_id);

CREATE INDEX IF NOT EXISTS idx_tamper_configs_camera
  ON camera_tamper_configs (camera_id);
