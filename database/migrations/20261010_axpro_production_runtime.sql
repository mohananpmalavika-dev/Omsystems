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

-- Keep the legacy named severity values; normalized events also use P0-P4.
ALTER TABLE security_device_events DROP CONSTRAINT IF EXISTS security_device_events_severity_check;
ALTER TABLE security_device_events ADD CONSTRAINT security_device_events_severity_check
  CHECK (severity IN ('INFO','LOW','MEDIUM','HIGH','CRITICAL','P0','P1','P2','P3','P4'));

CREATE INDEX IF NOT EXISTS idx_security_device_integrations_axpro_due
  ON security_device_integrations (last_poll_attempt_at)
  WHERE adapter_name = 'HIKVISION_AX_PRO' AND status IN ('ACTIVE','ERROR');

-- Integration-scoped identity survives device reassignment/re-enrollment.
CREATE UNIQUE INDEX IF NOT EXISTS idx_axpro_integration_event_identity
  ON security_device_events (tenant_id, (metadata->>'axProIntegrationId'), (metadata->>'idempotencyKey'))
  WHERE metadata->>'source' = 'hikvision-ax-pro' AND metadata ? 'axProIntegrationId' AND metadata ? 'idempotencyKey';
