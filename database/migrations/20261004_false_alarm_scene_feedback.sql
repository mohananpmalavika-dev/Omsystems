-- Freeze the reviewed object/scene independently of later detector updates.
ALTER TABLE analytics_alerts
  ADD COLUMN IF NOT EXISTS detection_signature JSONB,
  ADD COLUMN IF NOT EXISTS false_alarm_signature JSONB;

CREATE INDEX IF NOT EXISTS idx_analytics_false_alarm_feedback
  ON analytics_alerts (tenant_id, camera_id, rule_id)
  WHERE status = 'false_alarm' AND false_alarm_signature IS NOT NULL;
