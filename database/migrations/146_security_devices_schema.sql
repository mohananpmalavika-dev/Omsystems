-- ============================================================================
-- Security Device Inventory Schema
-- Migration: 146_security_devices_schema.sql
--
-- Creates all tables required for the unified physical security device
-- management system (CCTV, access control, intrusion, fire, ATM, vault, etc.)
-- ============================================================================

-- ============================================================================
-- Core: security_devices
-- ============================================================================

CREATE TABLE IF NOT EXISTS security_devices (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 TEXT NOT NULL,
  branch_id                 UUID REFERENCES branches(id) ON DELETE SET NULL,

  -- Identity
  type                      TEXT NOT NULL,
  name                      TEXT NOT NULL,
  description               TEXT,
  manufacturer              TEXT,
  model                     TEXT,
  serial_number             TEXT,
  firmware_version          TEXT,
  hardware_version          TEXT,

  -- Network
  ip_address                INET,
  mac_address               TEXT,
  port                      INTEGER,
  protocol                  TEXT,

  -- State
  status                    TEXT NOT NULL DEFAULT 'UNKNOWN'
                              CHECK (status IN ('ONLINE','OFFLINE','DEGRADED','ALARM','MAINTENANCE','DISABLED','PROVISIONING','UNKNOWN')),
  health                    TEXT NOT NULL DEFAULT 'UNKNOWN'
                              CHECK (health IN ('EXCELLENT','GOOD','FAIR','POOR','CRITICAL','UNKNOWN')),
  last_seen_at              TIMESTAMPTZ,
  last_health_check_at      TIMESTAMPTZ,

  -- Capabilities & config
  capabilities              JSONB NOT NULL DEFAULT '[]'::jsonb,
  polling_interval_seconds  INTEGER NOT NULL DEFAULT 60,
  event_buffer_size         INTEGER NOT NULL DEFAULT 1000,
  credential_ref_id         TEXT,

  -- Relationships
  parent_device_id          UUID REFERENCES security_devices(id) ON DELETE SET NULL,
  controller_device_id      UUID REFERENCES security_devices(id) ON DELETE SET NULL,
  digital_twin_object_id    UUID,

  -- Discovery / enrollment
  auto_discovered           BOOLEAN NOT NULL DEFAULT false,
  enrollment_status         TEXT NOT NULL DEFAULT 'APPROVED'
                              CHECK (enrollment_status IN ('PENDING','APPROVED','REJECTED','ENROLLED')),

  -- Arbitrary metadata
  metadata                  JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Audit
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                TEXT,
  updated_by                TEXT
);

CREATE INDEX IF NOT EXISTS idx_security_devices_tenant      ON security_devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_security_devices_branch      ON security_devices(branch_id);
CREATE INDEX IF NOT EXISTS idx_security_devices_type        ON security_devices(type);
CREATE INDEX IF NOT EXISTS idx_security_devices_status      ON security_devices(status);
CREATE INDEX IF NOT EXISTS idx_security_devices_health      ON security_devices(health);
CREATE INDEX IF NOT EXISTS idx_security_devices_enrollment  ON security_devices(enrollment_status);
CREATE INDEX IF NOT EXISTS idx_security_devices_created     ON security_devices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_devices_ip          ON security_devices(ip_address);
CREATE INDEX IF NOT EXISTS idx_security_devices_mac         ON security_devices(LOWER(mac_address));

COMMENT ON TABLE security_devices IS 'Unified physical security device registry (CCTV, access control, intrusion, fire, banking, power, network)';

-- ============================================================================
-- Health Snapshots
-- ============================================================================

CREATE TABLE IF NOT EXISTS security_device_health_snapshots (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id                 UUID NOT NULL REFERENCES security_devices(id) ON DELETE CASCADE,
  tenant_id                 TEXT NOT NULL,
  branch_id                 UUID,

  health                    TEXT NOT NULL,
  health_score              NUMERIC(5,2),
  is_online                 BOOLEAN NOT NULL DEFAULT false,

  response_time_ms          INTEGER,
  packet_loss_percent       NUMERIC(5,2),
  signal_strength_dbm       INTEGER,

  cpu_usage_percent         NUMERIC(5,2),
  memory_usage_percent      NUMERIC(5,2),
  storage_usage_percent     NUMERIC(5,2),
  temperature_celsius       NUMERIC(6,2),

  power_status              TEXT,
  battery_level_percent     NUMERIC(5,2),
  battery_voltage           NUMERIC(6,3),
  ups_runtime_minutes       INTEGER,

  error_count               INTEGER NOT NULL DEFAULT 0,
  warning_count             INTEGER NOT NULL DEFAULT 0,
  last_error_message        TEXT,
  last_error_at             TIMESTAMPTZ,

  uptime_seconds            BIGINT,
  last_reboot_at            TIMESTAMPTZ,
  last_maintenance_at       TIMESTAMPTZ,
  next_maintenance_due      TIMESTAMPTZ,

  metadata                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sec_health_device    ON security_device_health_snapshots(device_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_health_tenant    ON security_device_health_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sec_health_captured  ON security_device_health_snapshots(captured_at DESC);

COMMENT ON TABLE security_device_health_snapshots IS 'Time-series health snapshots for physical security devices';

-- ============================================================================
-- Events
-- ============================================================================

CREATE TABLE IF NOT EXISTS security_device_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             TEXT NOT NULL,
  branch_id             UUID,
  device_id             UUID NOT NULL REFERENCES security_devices(id) ON DELETE CASCADE,

  event_type            TEXT NOT NULL,
  severity              TEXT NOT NULL DEFAULT 'INFO'
                          CHECK (severity IN ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  category              TEXT,
  title                 TEXT NOT NULL,
  description           TEXT,

  occurred_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at          TIMESTAMPTZ,

  user_id               UUID,
  credential            TEXT,
  location              JSONB,
  correlation_id        UUID,
  parent_event_id       UUID REFERENCES security_device_events(id) ON DELETE SET NULL,
  incident_id           UUID,

  processed             BOOLEAN NOT NULL DEFAULT false,
  acknowledged          BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by       TEXT,
  acknowledged_at       TIMESTAMPTZ,

  payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_payload    JSONB,
  snapshot_url          TEXT,
  video_url             TEXT,
  attached_camera_ids   UUID[] NOT NULL DEFAULT '{}',

  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sec_events_device     ON security_device_events(device_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_events_tenant     ON security_device_events(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_events_branch     ON security_device_events(branch_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_events_type       ON security_device_events(event_type);
CREATE INDEX IF NOT EXISTS idx_sec_events_severity   ON security_device_events(severity);
CREATE INDEX IF NOT EXISTS idx_sec_events_processed  ON security_device_events(processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_sec_events_acked      ON security_device_events(acknowledged) WHERE acknowledged = false;
CREATE INDEX IF NOT EXISTS idx_sec_events_occurred   ON security_device_events(occurred_at DESC);

COMMENT ON TABLE security_device_events IS 'Security device events and alerts (access, intrusion, fire, tamper, etc.)';

-- ============================================================================
-- Commands (device control with approval workflow)
-- ============================================================================

CREATE TABLE IF NOT EXISTS security_device_commands (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         TEXT NOT NULL,
  branch_id         UUID,
  device_id         UUID NOT NULL REFERENCES security_devices(id) ON DELETE CASCADE,

  command           TEXT NOT NULL,
  parameters        JSONB NOT NULL DEFAULT '{}'::jsonb,

  requested_by      TEXT NOT NULL,
  approved_by       TEXT,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  requires_mfa      BOOLEAN NOT NULL DEFAULT false,
  reason            TEXT,

  status            TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING','APPROVED','REJECTED','EXECUTING','COMPLETED','FAILED','TIMED_OUT')),
  result            JSONB,
  error_message     TEXT,

  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at       TIMESTAMPTZ,
  executed_at       TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  timeout_seconds   INTEGER NOT NULL DEFAULT 300,

  audit_log         JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sec_commands_device  ON security_device_commands(device_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_commands_tenant  ON security_device_commands(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sec_commands_status  ON security_device_commands(status);
CREATE INDEX IF NOT EXISTS idx_sec_commands_pending ON security_device_commands(status) WHERE status = 'PENDING';

COMMENT ON TABLE security_device_commands IS 'Device control commands with approval workflow and full audit trail';

-- ============================================================================
-- Security Device Discovery Jobs
-- ============================================================================

CREATE TABLE IF NOT EXISTS security_device_discovery_jobs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             TEXT NOT NULL,
  branch_id             UUID REFERENCES branches(id) ON DELETE SET NULL,
  network_range         TEXT NOT NULL,
  scan_type             TEXT NOT NULL DEFAULT 'QUICK',
  include_device_types  JSONB NOT NULL DEFAULT '[]'::jsonb,
  exclude_device_types  JSONB NOT NULL DEFAULT '[]'::jsonb,
  status                TEXT NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED')),
  progress_percent      NUMERIC(5,2) NOT NULL DEFAULT 0,
  devices_discovered    INTEGER NOT NULL DEFAULT 0,
  devices_enrolled      INTEGER NOT NULL DEFAULT 0,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  duration_seconds      INTEGER,
  error_message         TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sec_disc_jobs_tenant ON security_device_discovery_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sec_disc_jobs_branch ON security_device_discovery_jobs(branch_id);
CREATE INDEX IF NOT EXISTS idx_sec_disc_jobs_status ON security_device_discovery_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sec_disc_jobs_created ON security_device_discovery_jobs(created_at DESC);

COMMENT ON TABLE security_device_discovery_jobs IS 'Device discovery scans and jobs';

-- ============================================================================
-- Discovered Devices (pending enrollment from network scans)
-- ============================================================================

CREATE TABLE IF NOT EXISTS security_discovered_devices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           TEXT NOT NULL,
  branch_id           UUID REFERENCES branches(id) ON DELETE SET NULL,
  discovery_job_id    UUID REFERENCES security_device_discovery_jobs(id) ON DELETE SET NULL,

  ip_address          INET,
  mac_address         TEXT,
  hostname            TEXT,
  serial_number       TEXT,
  device_type         TEXT,
  manufacturer        TEXT,
  model               TEXT,
  firmware_version    TEXT,
  protocol            TEXT,
  port                INTEGER,

  capabilities        JSONB NOT NULL DEFAULT '[]'::jsonb,
  open_ports          INTEGER[],
  detected_services   JSONB NOT NULL DEFAULT '[]'::jsonb,
  banner              TEXT,
  fingerprint         TEXT,
  confidence          NUMERIC(5,2) NOT NULL DEFAULT 0,
  confidence_score    NUMERIC(5,2),

  enrollment_status   TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
                        CHECK (enrollment_status IN ('PENDING','PENDING_REVIEW','APPROVED','REJECTED','ENROLLED')),
  enrolled_device_id  UUID REFERENCES security_devices(id) ON DELETE SET NULL,
  enrolled_at         TIMESTAMPTZ,
  reviewed_by         TEXT,
  reviewed_at         TIMESTAMPTZ,
  rejected_by         TEXT,
  rejected_at         TIMESTAMPTZ,
  rejection_reason    TEXT,

  discovered_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sec_discovered_tenant  ON security_discovered_devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sec_discovered_branch  ON security_discovered_devices(branch_id);
CREATE INDEX IF NOT EXISTS idx_sec_discovered_status  ON security_discovered_devices(enrollment_status);
CREATE INDEX IF NOT EXISTS idx_sec_discovered_ip      ON security_discovered_devices(ip_address);
CREATE INDEX IF NOT EXISTS idx_sec_discovered_mac     ON security_discovered_devices(LOWER(mac_address));
CREATE INDEX IF NOT EXISTS idx_sec_discovered_job     ON security_discovered_devices(discovery_job_id);
CREATE INDEX IF NOT EXISTS idx_sec_discovered_disc_at ON security_discovered_devices(discovered_at DESC);

COMMENT ON TABLE security_discovered_devices IS 'Devices found by network discovery scans, pending enrollment approval';

-- ============================================================================
-- Branch Security Posture (materialised per-branch summary)
-- ============================================================================

CREATE TABLE IF NOT EXISTS branch_security_posture (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               TEXT NOT NULL,
  branch_id               UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,

  overall_status          TEXT NOT NULL DEFAULT 'UNKNOWN',
  security_score          NUMERIC(5,2) NOT NULL DEFAULT 0,

  cctv_status             JSONB NOT NULL DEFAULT '{}'::jsonb,
  access_control_status   JSONB NOT NULL DEFAULT '{}'::jsonb,
  intrusion_status        JSONB NOT NULL DEFAULT '{}'::jsonb,
  fire_status             JSONB NOT NULL DEFAULT '{}'::jsonb,
  banking_status          JSONB NOT NULL DEFAULT '{}'::jsonb,
  power_status            JSONB NOT NULL DEFAULT '{}'::jsonb,
  network_status          JSONB NOT NULL DEFAULT '{}'::jsonb,

  active_alarms           INTEGER NOT NULL DEFAULT 0,
  critical_issues         INTEGER NOT NULL DEFAULT 0,
  warnings                INTEGER NOT NULL DEFAULT 0,
  correlated_incidents    INTEGER NOT NULL DEFAULT 0,

  ai_insights             JSONB NOT NULL DEFAULT '[]'::jsonb,

  computed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT branch_security_posture_unique UNIQUE (tenant_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_posture_tenant  ON branch_security_posture(tenant_id);
CREATE INDEX IF NOT EXISTS idx_branch_posture_branch  ON branch_security_posture(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_posture_score   ON branch_security_posture(security_score DESC);

COMMENT ON TABLE branch_security_posture IS 'Aggregated security health posture per branch';

-- ============================================================================
-- Trigger: keep updated_at current
-- ============================================================================

CREATE OR REPLACE FUNCTION update_security_device_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_security_devices_updated_at') THEN
    CREATE TRIGGER trg_security_devices_updated_at
      BEFORE UPDATE ON security_devices
      FOR EACH ROW EXECUTE FUNCTION update_security_device_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_branch_posture_updated_at') THEN
    CREATE TRIGGER trg_branch_posture_updated_at
      BEFORE UPDATE ON branch_security_posture
      FOR EACH ROW EXECUTE FUNCTION update_security_device_updated_at();
  END IF;
END;
$$;

-- ============================================================================
-- Function: recompute branch security posture
-- Called by SecurityDeviceService.updateBranchPosture() via:
--   SELECT update_branch_security_posture($1)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_branch_security_posture(p_branch_id UUID)
RETURNS void AS $$
DECLARE
  v_tenant_id   TEXT;
  v_total       INTEGER := 0;
  v_online      INTEGER := 0;
  v_critical    INTEGER := 0;
  v_alarms      INTEGER := 0;
  v_warnings    INTEGER := 0;
  v_score       NUMERIC(5,2);
  v_overall     TEXT;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM security_devices WHERE branch_id = p_branch_id LIMIT 1;

  IF v_tenant_id IS NULL THEN RETURN; END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'ONLINE'),
    COUNT(*) FILTER (WHERE health  = 'CRITICAL'),
    COUNT(*) FILTER (WHERE status  = 'ALARM'),
    COUNT(*) FILTER (WHERE health  IN ('POOR','FAIR'))
  INTO v_total, v_online, v_critical, v_alarms, v_warnings
  FROM security_devices WHERE branch_id = p_branch_id;

  IF v_total > 0 THEN
    v_score := GREATEST(0, LEAST(100,
      ROUND(((v_online::NUMERIC / v_total) * 100) - (v_critical * 10) - (v_alarms * 5), 2)
    ));
  ELSE
    v_score := 100;
  END IF;

  IF    v_critical > 0 OR v_alarms > 0 THEN v_overall := 'CRITICAL';
  ELSIF v_warnings > 0                  THEN v_overall := 'DEGRADED';
  ELSIF v_online = v_total AND v_total > 0 THEN v_overall := 'HEALTHY';
  ELSE  v_overall := 'UNKNOWN';
  END IF;

  INSERT INTO branch_security_posture (
    tenant_id, branch_id, overall_status, security_score,
    active_alarms, critical_issues, warnings, computed_at, updated_at
  ) VALUES (
    v_tenant_id, p_branch_id, v_overall, v_score,
    v_alarms, v_critical, v_warnings, now(), now()
  )
  ON CONFLICT (tenant_id, branch_id) DO UPDATE SET
    overall_status  = EXCLUDED.overall_status,
    security_score  = EXCLUDED.security_score,
    active_alarms   = EXCLUDED.active_alarms,
    critical_issues = EXCLUDED.critical_issues,
    warnings        = EXCLUDED.warnings,
    computed_at     = EXCLUDED.computed_at,
    updated_at      = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_branch_security_posture IS
  'Recomputes and upserts branch_security_posture for a given branch.';
