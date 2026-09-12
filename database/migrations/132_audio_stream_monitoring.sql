-- ============================================================================
-- Migration 132: Audio Stream Monitoring (video.audio)
--
-- Production schema for real-time camera audio channel decoding,
-- level metering (Peak, RMS, LUFS, Crest Factor), acoustic anomaly alerts,
-- and persistent telemetry.
-- ============================================================================

-- 1. Create audio channel configurations table
CREATE TABLE IF NOT EXISTS audio_channel_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  channel_number integer NOT NULL DEFAULT 1,
  is_enabled boolean NOT NULL DEFAULT true,
  codec text NOT NULL DEFAULT 'PCMU',
  sample_rate_hz integer NOT NULL DEFAULT 8000,
  channels integer NOT NULL DEFAULT 1,
  gain_db double precision NOT NULL DEFAULT 0.0,
  silence_threshold_dbfs double precision NOT NULL DEFAULT -65.0,
  silence_timeout_sec integer NOT NULL DEFAULT 15,
  noise_threshold_dbfs double precision NOT NULL DEFAULT -12.0,
  noise_trigger_duration_ms integer NOT NULL DEFAULT 200,
  scream_detection_enabled boolean NOT NULL DEFAULT true,
  spike_sensitivity double precision NOT NULL DEFAULT 0.85,
  clipping_alert_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_audio_channel_config UNIQUE (camera_id, channel_number)
);

CREATE INDEX IF NOT EXISTS idx_audio_channel_configs_tenant
  ON audio_channel_configs (tenant_id);

CREATE INDEX IF NOT EXISTS idx_audio_channel_configs_camera
  ON audio_channel_configs (camera_id);

-- 2. Create audio meter telemetry rollups table
CREATE TABLE IF NOT EXISTS audio_meter_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_number integer NOT NULL DEFAULT 1,
  sample_timestamp timestamptz NOT NULL DEFAULT now(),
  rms_dbfs double precision NOT NULL,
  peak_dbfs double precision NOT NULL,
  peak_hold_dbfs double precision NOT NULL,
  lufs double precision NOT NULL,
  crest_factor_db double precision NOT NULL,
  noise_floor_dbfs double precision NOT NULL,
  snr_db double precision NOT NULL,
  clipped_samples integer NOT NULL DEFAULT 0,
  clip_percentage double precision NOT NULL DEFAULT 0.0,
  vad_state text NOT NULL DEFAULT 'SILENCE',
  low_band_pct double precision NOT NULL DEFAULT 0.0,
  mid_band_pct double precision NOT NULL DEFAULT 0.0,
  high_band_pct double precision NOT NULL DEFAULT 0.0
);

CREATE INDEX IF NOT EXISTS idx_audio_telemetry_camera_time
  ON audio_meter_telemetry (camera_id, sample_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audio_telemetry_tenant_time
  ON audio_meter_telemetry (tenant_id, sample_timestamp DESC);

-- 3. Create audio monitoring alerts table
CREATE TABLE IF NOT EXISTS audio_monitoring_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  channel_number integer NOT NULL DEFAULT 1,
  alert_type text NOT NULL CHECK (alert_type IN ('audio_loss', 'high_noise_threshold', 'acoustic_spike', 'scream_distress', 'clipping_distortion')),
  severity text NOT NULL CHECK (severity IN ('P1', 'P2', 'P3', 'P4')),
  status text NOT NULL DEFAULT 'detected' CHECK (status IN ('detected', 'acknowledged', 'resolved', 'false_positive')),
  peak_dbfs double precision NOT NULL,
  rms_dbfs double precision NOT NULL,
  duration_ms integer NOT NULL DEFAULT 0,
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  acknowledged_by uuid REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audio_alerts_tenant_time
  ON audio_monitoring_alerts (tenant_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_audio_alerts_camera_time
  ON audio_monitoring_alerts (camera_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_audio_alerts_status
  ON audio_monitoring_alerts (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_audio_alerts_type_severity
  ON audio_monitoring_alerts (tenant_id, alert_type, severity);
