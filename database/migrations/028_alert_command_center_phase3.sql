ALTER TABLE analytics_alerts
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS correlation_key text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version > 0);

CREATE INDEX IF NOT EXISTS analytics_alerts_ho_queue_idx
  ON analytics_alerts (tenant_id, severity, status, last_detected_at DESC);
CREATE INDEX IF NOT EXISTS analytics_alerts_correlation_idx
  ON analytics_alerts (tenant_id, correlation_key, last_detected_at DESC)
  WHERE correlation_key IS NOT NULL;

ALTER TABLE analytics_notifications DROP CONSTRAINT IF EXISTS analytics_notifications_status_check;
ALTER TABLE analytics_notifications
  ADD CONSTRAINT analytics_notifications_status_check CHECK (
    status IN ('queued','processing','sent','delivered','failed','dead','cancelled')
  );
ALTER TABLE analytics_notifications
  ADD COLUMN IF NOT EXISTS provider_id text,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS analytics_notifications_target_uidx
  ON analytics_notifications (alert_id, channel, recipient);
CREATE INDEX IF NOT EXISTS analytics_notifications_phase3_queue_idx
  ON analytics_notifications (next_attempt_at, created_at)
  WHERE status IN ('queued','failed');

CREATE TABLE IF NOT EXISTS alert_notification_policies (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  recipient_groups jsonb NOT NULL DEFAULT '{}'::jsonb,
  on_call_schedules jsonb NOT NULL DEFAULT '[]'::jsonb,
  quiet_hours jsonb,
  rate_limit_per_minute integer NOT NULL DEFAULT 120 CHECK (rate_limit_per_minute BETWEEN 1 AND 10000),
  escalation_after_seconds jsonb NOT NULL DEFAULT '{"P1":30,"P2":300,"P3":900}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE alert_notification_policies IS
  'Tenant recipient groups, on-call windows, quiet hours, rate limits and escalation SLA policy for the HO alert command center';
