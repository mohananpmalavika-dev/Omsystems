-- ============================================================================
-- Migration 152: Autonomous Voice Talk-Down AI (Active Deterrent)
--
-- Enables autonomous edge voice warnings, strobe lights, and sirens over
-- camera speakers and backchannels to deter intruders in restricted zones
-- (Vault, Strong Room, Cash Counter) and during after-hours schedules.
-- ============================================================================

CREATE TABLE IF NOT EXISTS autonomous_deterrent_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  camera_id UUID REFERENCES cameras(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  zone_types TEXT[] NOT NULL DEFAULT ARRAY['vault', 'strong-room', 'cash-counter', 'server-room', 'perimeter-fence', 'restricted-zone']::TEXT[],
  schedule_type VARCHAR(32) NOT NULL DEFAULT 'after_hours' CHECK (schedule_type IN ('24x7', 'after_hours', 'custom')),
  schedule_start_time VARCHAR(8) NOT NULL DEFAULT '20:00',
  schedule_end_time VARCHAR(8) NOT NULL DEFAULT '06:00',
  schedule_days_of_week INTEGER[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6]::INTEGER[],
  detection_types TEXT[] NOT NULL DEFAULT ARRAY['person_detected', 'intrusion', 'loitering', 'perimeter_breach', 'vault_unauthorized_entry']::TEXT[],
  primary_language VARCHAR(16) NOT NULL DEFAULT 'ml' CHECK (primary_language IN ('ml', 'en', 'hi', 'bilingual_ml_en')),
  custom_warning_text TEXT,
  siren_enabled BOOLEAN NOT NULL DEFAULT false,
  strobe_enabled BOOLEAN NOT NULL DEFAULT true,
  cooldown_seconds INTEGER NOT NULL DEFAULT 60 CHECK (cooldown_seconds >= 10 AND cooldown_seconds <= 3600),
  escalation_enabled BOOLEAN NOT NULL DEFAULT true,
  escalation_window_seconds INTEGER NOT NULL DEFAULT 300 CHECK (escalation_window_seconds >= 30 AND escalation_window_seconds <= 3600),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deterrent_rules_tenant_branch
  ON autonomous_deterrent_rules (tenant_id, branch_id, enabled);

CREATE INDEX IF NOT EXISTS idx_deterrent_rules_camera
  ON autonomous_deterrent_rules (camera_id, enabled);

CREATE TABLE IF NOT EXISTS autonomous_deterrent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES autonomous_deterrent_rules(id) ON DELETE SET NULL,
  alert_id VARCHAR(128),
  detection_type VARCHAR(64) NOT NULL,
  language VARCHAR(16) NOT NULL,
  speech_text TEXT NOT NULL,
  actions_triggered TEXT[] NOT NULL DEFAULT ARRAY['voice_announcement']::TEXT[],
  status VARCHAR(32) NOT NULL DEFAULT 'executed' CHECK (status IN ('executed', 'cooldown_suppressed', 'preempted_by_operator', 'device_offline', 'failed')),
  escalation_level INTEGER NOT NULL DEFAULT 1 CHECK (escalation_level >= 1 AND escalation_level <= 3),
  latency_ms INTEGER NOT NULL DEFAULT 0,
  talkback_session_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deterrent_logs_camera_created
  ON autonomous_deterrent_logs (camera_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deterrent_logs_tenant_created
  ON autonomous_deterrent_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deterrent_logs_rule
  ON autonomous_deterrent_logs (rule_id);

COMMENT ON TABLE autonomous_deterrent_rules IS
  'Configurable automated voice talk-down, strobe, and siren deterrent policies for bank restricted zones.';
COMMENT ON TABLE autonomous_deterrent_logs IS
  'Forensic audit ledger of autonomous voice talk-down actions, operator preemptions, and cooldown suppressions.';
