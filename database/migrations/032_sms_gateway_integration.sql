ALTER TABLE analytics_notifications
  ADD COLUMN IF NOT EXISTS sms_delivery jsonb;

ALTER TABLE alert_notification_policies
  ADD COLUMN IF NOT EXISTS sms_templates jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sms_template_ids jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS analytics_notifications_sms_delivery_idx
  ON analytics_notifications (tenant_id, alert_id, (sms_delivery->>'status'))
  WHERE channel = 'sms';

COMMENT ON COLUMN alert_notification_policies.sms_templates IS
  'Tenant-managed P1/P2 SMS templates using documented alert placeholders';

CREATE TABLE IF NOT EXISTS sms_rate_limit_windows (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  sent_count integer NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  PRIMARY KEY (tenant_id, window_start)
);
