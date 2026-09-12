-- ============================================================================
-- Migration 122: Worker/Elderly Fall Detection Hardening (analytics.fall_detection)
--
-- Authoritative operational ledger for person fall detections, kinematic dynamics,
-- pose estimation telemetry, motionless monitoring, per-camera threshold configurations,
-- and operator audit reviews.
-- ============================================================================

-- 1. Create authoritative fall_detection_events table
CREATE TABLE IF NOT EXISTS fall_detection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  track_id text NOT NULL,
  person_category text NOT NULL DEFAULT 'general' CHECK (person_category IN ('worker', 'elderly', 'general')),
  fall_type text NOT NULL DEFAULT 'unknown' CHECK (fall_type IN ('forward', 'backward', 'sideways', 'slump', 'scaffold_drop', 'unknown')),
  confidence numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  severity text NOT NULL CHECK (severity IN ('P1', 'P2', 'P3')),
  impact_speed numeric(10,4) NOT NULL DEFAULT 0.0,
  aspect_ratio_peak numeric(6,3) NOT NULL DEFAULT 0.0,
  torso_angle_degrees numeric(6,2),
  motionless_duration_seconds numeric(8,2) NOT NULL DEFAULT 0.0,
  recovery_detected boolean NOT NULL DEFAULT false,
  recovery_time_seconds numeric(8,2),
  bounding_box jsonb NOT NULL DEFAULT '{}'::jsonb,
  pose_keypoints jsonb NOT NULL DEFAULT '{}'::jsonb,
  dynamics_telemetry jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_reference text,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'confirmed', 'false_positive', 'escalated')),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create high-performance query indexes
CREATE INDEX IF NOT EXISTS idx_fall_events_tenant_time
  ON fall_detection_events (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_fall_events_camera_time
  ON fall_detection_events (camera_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_fall_events_review
  ON fall_detection_events (tenant_id, review_status, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_fall_events_severity
  ON fall_detection_events (tenant_id, severity, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_fall_events_category
  ON fall_detection_events (tenant_id, person_category, occurred_at DESC);

-- 3. Create per-camera configuration overrides for fall detection
CREATE TABLE IF NOT EXISTS fall_detection_configs (
  camera_id uuid PRIMARY KEY REFERENCES cameras(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  profile text NOT NULL DEFAULT 'worker' CHECK (profile IN ('worker', 'elderly', 'general')),
  sensitivity numeric(3,2) NOT NULL DEFAULT 0.75 CHECK (sensitivity BETWEEN 0.1 AND 1.0),
  min_confidence numeric(3,2) NOT NULL DEFAULT 0.65 CHECK (min_confidence BETWEEN 0.1 AND 1.0),
  aspect_ratio_threshold numeric(4,2) NOT NULL DEFAULT 1.20 CHECK (aspect_ratio_threshold >= 0.5),
  velocity_threshold numeric(6,3) NOT NULL DEFAULT 0.150 CHECK (velocity_threshold >= 0.01),
  torso_angle_threshold numeric(4,1) NOT NULL DEFAULT 35.0 CHECK (torso_angle_threshold BETWEEN 5.0 AND 80.0),
  motionless_delay_seconds numeric(4,1) NOT NULL DEFAULT 3.0 CHECK (motionless_delay_seconds >= 1.0),
  recovery_timeout_seconds numeric(5,1) NOT NULL DEFAULT 15.0 CHECK (recovery_timeout_seconds >= 3.0),
  alert_severity text NOT NULL DEFAULT 'P1' CHECK (alert_severity IN ('P1', 'P2', 'P3')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fall_configs_tenant
  ON fall_detection_configs (tenant_id);

-- 4. Audit comments
COMMENT ON TABLE fall_detection_events IS
  'Authoritative operational ledger for worker and elderly fall detections with verifiable pose estimation and aspect ratio kinematics.';
COMMENT ON TABLE fall_detection_configs IS
  'Per-camera threshold parameters and alert sensitivity configurations for worker/elderly fall detection.';
