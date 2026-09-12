-- ============================================================================
-- Migration 118: Physical Violence & Fight Detection Hardening (analytics.violence)
--
-- Dedicated ledger for violent encounter detections, optical flow kinetic telemetry,
-- limb acceleration measurements, per-camera threshold configs, and operator audit trail.
-- ============================================================================

-- 1. Create authoritative violence_detection_events table
CREATE TABLE IF NOT EXISTS violence_detection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  confidence numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  severity text NOT NULL CHECK (severity IN ('P1', 'P2', 'P3')),
  optical_flow_energy numeric(10,4) NOT NULL DEFAULT 0.0,
  turbulence_score numeric(10,4) NOT NULL DEFAULT 0.0,
  max_limb_acceleration numeric(10,4) NOT NULL DEFAULT 0.0,
  strike_count integer NOT NULL DEFAULT 0,
  participant_count integer NOT NULL DEFAULT 0,
  participant_track_ids text[] NOT NULL DEFAULT '{}',
  interaction_box jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_reference text,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'confirmed', 'false_positive', 'escalated')),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create high-performance query indexes
CREATE INDEX IF NOT EXISTS idx_violence_events_tenant_time
  ON violence_detection_events (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_violence_events_camera_time
  ON violence_detection_events (camera_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_violence_events_review
  ON violence_detection_events (tenant_id, review_status, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_violence_events_severity
  ON violence_detection_events (tenant_id, severity, occurred_at DESC);

-- 3. Create per-camera configuration overrides for violence detection
CREATE TABLE IF NOT EXISTS violence_detection_configs (
  camera_id uuid PRIMARY KEY REFERENCES cameras(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  sensitivity numeric(3,2) NOT NULL DEFAULT 0.70 CHECK (sensitivity BETWEEN 0.1 AND 1.0),
  min_confidence numeric(3,2) NOT NULL DEFAULT 0.65 CHECK (min_confidence BETWEEN 0.1 AND 1.0),
  min_optical_flow_energy numeric(8,2) NOT NULL DEFAULT 25.0 CHECK (min_optical_flow_energy >= 0),
  min_limb_acceleration numeric(8,2) NOT NULL DEFAULT 30.0 CHECK (min_limb_acceleration >= 0),
  min_duration_ms integer NOT NULL DEFAULT 500 CHECK (min_duration_ms >= 100),
  cooldown_seconds integer NOT NULL DEFAULT 15 CHECK (cooldown_seconds >= 1),
  alert_severity text NOT NULL DEFAULT 'P1' CHECK (alert_severity IN ('P1', 'P2', 'P3')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_violence_configs_tenant
  ON violence_detection_configs (tenant_id);

-- 4. Audit comments
COMMENT ON TABLE violence_detection_events IS
  'Authoritative operational ledger for physical violence, fights, and assault detections with verifiable optical flow and limb kinematics.';
COMMENT ON TABLE violence_detection_configs IS
  'Per-camera threshold parameters and alert sensitivity configurations for physical violence detection.';
