-- Pause no-helmet alarms on existing cameras while retaining historical alerts.
UPDATE analytics_rules
SET enabled = false, updated_at = NOW()
WHERE detection_type = 'no-helmet' AND enabled = true;
