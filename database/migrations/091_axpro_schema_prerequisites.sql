-- Early prerequisites for immutable migration 092. Core tables mirror migration 146.
-- CREATE IF NOT EXISTS makes this safe for already-migrated installations.
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
-- Applies to existing installations as well as a fresh migration run.
CREATE TABLE IF NOT EXISTS security_device_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  integration_type TEXT NOT NULL DEFAULT 'DIRECT',
  adapter_name TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  protocol TEXT NOT NULL,
  connection_config JSONB NOT NULL DEFAULT '{}',
  credential_ref_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'INACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ERROR','MAINTENANCE')),
  polling_interval_seconds INTEGER NOT NULL DEFAULT 60 CHECK (polling_interval_seconds BETWEEN 10 AND 86400),
  auto_reconnect BOOLEAN NOT NULL DEFAULT true,
  max_retries INTEGER NOT NULL DEFAULT 3,
  last_sync_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error_message TEXT,
  devices_managed INTEGER NOT NULL DEFAULT 0,
  events_processed_today BIGINT NOT NULL DEFAULT 0,
  total_events_processed BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE security_device_integrations ADD COLUMN IF NOT EXISTS event_cursor_at TIMESTAMPTZ;
ALTER TABLE security_device_integrations ADD COLUMN IF NOT EXISTS last_poll_attempt_at TIMESTAMPTZ;
ALTER TABLE security_device_integrations ADD COLUMN IF NOT EXISTS events_counter_date DATE NOT NULL DEFAULT CURRENT_DATE;

