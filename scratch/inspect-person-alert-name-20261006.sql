BEGIN READ ONLY;
SELECT a.severity, a.status, a.title, count(*) FROM analytics_alerts a JOIN analytics_rules r ON r.id=a.rule_id
WHERE r.tenant_id='00000000-0000-4000-8000-000000000001' AND r.detection_type='person'
  AND r.schedule->>'start'='20:00' AND r.schedule->>'end'='08:00'
GROUP BY a.severity,a.status,a.title;
SELECT table_name,column_name,data_type FROM information_schema.columns
WHERE table_name IN ('incidents','operational_alerts','alert_incidents','analytics_notifications')
  AND column_name IN ('id','title','name','metadata','source_alert_id','alert_id','source_id','details','payload','description');
SELECT action,occurred_at FROM audit_events WHERE action='analytics.after_hours_person_configured' ORDER BY occurred_at DESC LIMIT 1;
COMMIT;
