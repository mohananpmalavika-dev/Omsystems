-- ============================================================================
-- Migration 122: Camera Obstruction & Dark Frame Detection (analytics.camera_obstruction)
--
-- Authoritative schema for edge-based and centralized heuristic detection of:
-- 1. Lens covering / physical occlusion (cloth, cardboard, tape, hand, sticker)
-- 2. Darkness / dark frame / optical blackout (loss of illumination, IR LED failure, power cutoff)
-- 3. Loss of visual variance (dead sensor, static flat frame, frozen noise floor)
-- 4. Partial obstruction (localized grid tile occlusion with bounding box)
-- 5. Glare / whiteout (overexposure blinding)
-- ============================================================================

-- 1. Create camera obstruction events table
CREATE TABLE IF NOT EXISTS camera_obstruction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  obstruction_type text NOT NULL CHECK (obstruction_type IN ('dark_frame', 'lens_covering', 'variance_loss', 'partial_obstruction', 'glare_whiteout')),
  severity text NOT NULL CHECK (severity IN ('P1', 'P2', 'P3', 'P4')),
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  obstruction_percent double precision NOT NULL DEFAULT 0.0 CHECK (obstruction_percent >= 0 AND obstruction_percent <= 100),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  tile_analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'detected' CHECK (status IN ('detected', 'acknowledged', 'resolved', 'false_positive')),
  snapshot_url text,
  baseline_snapshot_url text,
  notes text,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_obstruction_events_tenant_time
  ON camera_obstruction_events (tenant_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_obstruction_events_camera_time
  ON camera_obstruction_events (camera_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_obstruction_events_type_severity
  ON camera_obstruction_events (tenant_id, obstruction_type, severity);

CREATE INDEX IF NOT EXISTS idx_obstruction_events_status
  ON camera_obstruction_events (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_obstruction_events_branch
  ON camera_obstruction_events (branch_id, detected_at DESC)
  WHERE branch_id IS NOT NULL;

-- 2. Create camera obstruction baselines table
CREATE TABLE IF NOT EXISTS camera_obstruction_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL UNIQUE REFERENCES cameras(id) ON DELETE CASCADE,
  baseline_luminance double precision NOT NULL,
  baseline_variance double precision NOT NULL,
  baseline_edge_density double precision NOT NULL,
  baseline_entropy double precision NOT NULL,
  baseline_laplacian_variance double precision NOT NULL DEFAULT 0.0,
  tile_baselines jsonb NOT NULL DEFAULT '[]'::jsonb,
  reference_histogram jsonb NOT NULL DEFAULT '[]'::jsonb,
  reference_frame_hash text,
  calibrated_at timestamptz NOT NULL DEFAULT now(),
  sample_frames_count integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_obstruction_baselines_tenant
  ON camera_obstruction_baselines (tenant_id);

CREATE INDEX IF NOT EXISTS idx_obstruction_baselines_camera
  ON camera_obstruction_baselines (camera_id);

-- 3. Create camera obstruction configurations table
CREATE TABLE IF NOT EXISTS camera_obstruction_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL UNIQUE REFERENCES cameras(id) ON DELETE CASCADE,
  sensitivity double precision NOT NULL DEFAULT 0.8 CHECK (sensitivity >= 0 AND sensitivity <= 1),
  darkness_threshold double precision NOT NULL DEFAULT 8.0 CHECK (darkness_threshold >= 0 AND darkness_threshold <= 255),
  variance_floor double precision NOT NULL DEFAULT 12.0 CHECK (variance_floor >= 0),
  obstruction_percent_threshold double precision NOT NULL DEFAULT 70.0 CHECK (obstruction_percent_threshold >= 0 AND obstruction_percent_threshold <= 100),
  partial_threshold double precision NOT NULL DEFAULT 25.0 CHECK (partial_threshold >= 0 AND partial_threshold <= 100),
  debounce_frames integer NOT NULL DEFAULT 3 CHECK (debounce_frames >= 1),
  auto_recalibrate_hours integer NOT NULL DEFAULT 24,
  alert_on_dark_frame boolean NOT NULL DEFAULT true,
  alert_on_covering boolean NOT NULL DEFAULT true,
  alert_on_variance_loss boolean NOT NULL DEFAULT true,
  alert_on_partial boolean NOT NULL DEFAULT true,
  alert_on_glare boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_obstruction_configs_tenant
  ON camera_obstruction_configs (tenant_id);

CREATE INDEX IF NOT EXISTS idx_obstruction_configs_camera
  ON camera_obstruction_configs (camera_id);

COMMENT ON TABLE camera_obstruction_events IS 'Audit log of camera obstruction, lens occlusion, dark frame, and visual variance collapse incidents.';
COMMENT ON TABLE camera_obstruction_baselines IS 'Calibrated baseline optical profiles for individual cameras to detect subtle variance shifts.';
COMMENT ON TABLE camera_obstruction_configs IS 'Camera-specific sensitivity thresholds and alert configurations for optical obstruction detection.';
