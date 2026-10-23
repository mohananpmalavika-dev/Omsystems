-- ============================================================================
-- Migration 154: Acoustic AI (Audio Anomaly Detection & Blind-Spot Correlator)
--
-- Enables camera blind-spot acoustic intelligence:
-- 1. Glass Breaking Detection (High frequency brittle fracture ringing)
-- 2. Screaming / Aggression Detection (Vocal distress formants & pitch instability)
-- 3. Gunshot / Blast Detection (Supersonic shockwave N-wave & extreme crest factor)
-- 4. Shutter Tamper / Structural Breach Detection (Metallic impact & resonant ringing)
-- 5. Blind-Spot Spatial Mapping & Automated PTZ Slew Correlation
-- ============================================================================

-- 1. Create acoustic AI rules configuration table
CREATE TABLE IF NOT EXISTS acoustic_ai_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  camera_id UUID REFERENCES cameras(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  enabled_signatures TEXT[] NOT NULL DEFAULT ARRAY['glass_break', 'screaming_aggression', 'gunshot_blast', 'shutter_tamper_breach']::TEXT[],
  min_confidence DOUBLE PRECISION NOT NULL DEFAULT 0.70 CHECK (min_confidence >= 0.10 AND min_confidence <= 1.00),
  glass_sensitivity DOUBLE PRECISION NOT NULL DEFAULT 0.80 CHECK (glass_sensitivity >= 0.10 AND glass_sensitivity <= 1.00),
  scream_sensitivity DOUBLE PRECISION NOT NULL DEFAULT 0.75 CHECK (scream_sensitivity >= 0.10 AND scream_sensitivity <= 1.00),
  gunshot_sensitivity DOUBLE PRECISION NOT NULL DEFAULT 0.90 CHECK (gunshot_sensitivity >= 0.10 AND gunshot_sensitivity <= 1.00),
  shutter_sensitivity DOUBLE PRECISION NOT NULL DEFAULT 0.80 CHECK (shutter_sensitivity >= 0.10 AND shutter_sensitivity <= 1.00),
  blind_spot_auto_ptz BOOLEAN NOT NULL DEFAULT true,
  cross_camera_alert BOOLEAN NOT NULL DEFAULT true,
  cooldown_seconds INTEGER NOT NULL DEFAULT 15 CHECK (cooldown_seconds >= 3 AND cooldown_seconds <= 600),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acoustic_rules_tenant_branch
  ON acoustic_ai_rules (tenant_id, branch_id, enabled);

CREATE INDEX IF NOT EXISTS idx_acoustic_rules_camera
  ON acoustic_ai_rules (camera_id, enabled);

-- 2. Create camera acoustic blind-spots registry
CREATE TABLE IF NOT EXISTS acoustic_camera_blind_spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  zone_name VARCHAR(128) NOT NULL,
  sector_type VARCHAR(64) NOT NULL DEFAULT 'rear_corridor' CHECK (sector_type IN ('rear_corridor', 'exterior_shutter', 'cash_vault_side', 'atm_vestibule', 'partition_blind_spot', 'stairwell', 'custom')),
  azimuth_angle_deg DOUBLE PRECISION NOT NULL DEFAULT 180.0 CHECK (azimuth_angle_deg >= 0.0 AND azimuth_angle_deg <= 360.0),
  estimated_distance_m DOUBLE PRECISION NOT NULL DEFAULT 8.0,
  target_ptz_camera_id UUID REFERENCES cameras(id) ON DELETE SET NULL,
  target_ptz_preset_id INTEGER DEFAULT 1,
  target_ptz_pan_tilt JSONB DEFAULT '{"pan": 180, "tilt": -15, "zoom": 2.5}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acoustic_blind_spots_camera
  ON acoustic_camera_blind_spots (camera_id, is_active);

CREATE INDEX IF NOT EXISTS idx_acoustic_blind_spots_branch
  ON acoustic_camera_blind_spots (branch_id, is_active);

-- 3. Create acoustic anomaly events forensic ledger
CREATE TABLE IF NOT EXISTS acoustic_anomaly_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES acoustic_ai_rules(id) ON DELETE SET NULL,
  signature VARCHAR(64) NOT NULL CHECK (signature IN ('glass_break', 'screaming_aggression', 'gunshot_blast', 'shutter_tamper_breach', 'acoustic_spike', 'high_noise')),
  severity VARCHAR(16) NOT NULL DEFAULT 'P1' CHECK (severity IN ('P1', 'P2', 'P3', 'P4')),
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  is_blind_spot BOOLEAN NOT NULL DEFAULT false,
  blind_spot_sector VARCHAR(128),
  triangulated_azimuth_deg DOUBLE PRECISION,
  ptz_slew_triggered BOOLEAN NOT NULL DEFAULT false,
  ptz_target_camera_id UUID REFERENCES cameras(id) ON DELETE SET NULL,
  ptz_preset_recalled INTEGER,
  cross_alerted_camera_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  peak_dbfs DOUBLE PRECISION NOT NULL,
  rms_dbfs DOUBLE PRECISION NOT NULL,
  crest_factor_db DOUBLE PRECISION NOT NULL,
  snr_db DOUBLE PRECISION NOT NULL,
  spectral_centroid_hz DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  zero_crossing_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  attack_time_ms DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  decay_time_ms DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  waveform JSONB NOT NULL DEFAULT '[]'::jsonb,
  audio_snippet_url TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'detected' CHECK (status IN ('detected', 'acknowledged', 'verified_threat', 'false_positive')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acoustic_events_camera_time
  ON acoustic_anomaly_events (camera_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_acoustic_events_tenant_time
  ON acoustic_anomaly_events (tenant_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_acoustic_events_signature
  ON acoustic_anomaly_events (signature, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_acoustic_events_blind_spot
  ON acoustic_anomaly_events (is_blind_spot, detected_at DESC);

COMMENT ON TABLE acoustic_ai_rules IS
  'Per-camera Acoustic AI sensitivity configurations for glass break, screaming, gunshot, and shutter tamper anomalies.';
COMMENT ON TABLE acoustic_camera_blind_spots IS
  'Acoustic blind spot spatial mappings linking camera blind-spots with PTZ slew target presets.';
COMMENT ON TABLE acoustic_anomaly_events IS
  'Forensic audit ledger of acoustic anomaly detections, blind-spot triggers, and PTZ slew escalations.';
