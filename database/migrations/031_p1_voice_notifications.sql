ALTER TABLE analytics_notifications
  ADD COLUMN IF NOT EXISTS voice_call jsonb;

CREATE INDEX IF NOT EXISTS analytics_notifications_voice_call_idx
  ON analytics_notifications (tenant_id, alert_id, ((voice_call->>'sequence')::integer))
  WHERE channel = 'voice';

COMMENT ON COLUMN analytics_notifications.voice_call IS
  'P1 voice call-tree position and append-only provider/IVR/recording audit events';
