ALTER TABLE analytics_notifications
  ADD COLUMN IF NOT EXISTS email_delivery jsonb;

CREATE INDEX IF NOT EXISTS analytics_notifications_email_delivery_idx
  ON analytics_notifications (tenant_id, alert_id, (email_delivery->>'status'))
  WHERE channel = 'email';

COMMENT ON COLUMN analytics_notifications.email_delivery IS
  'Email delivery audit metadata for alert notification callbacks and provider status';
