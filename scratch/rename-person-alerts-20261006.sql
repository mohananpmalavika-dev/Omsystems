BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE renamed_person_alerts ON COMMIT DROP AS
SELECT a.id,a.title,a.incident_id FROM analytics_alerts a JOIN analytics_rules r ON r.id=a.rule_id
WHERE r.tenant_id='00000000-0000-4000-8000-000000000001' AND r.detection_type='person'
  AND r.schedule->>'start'='20:00' AND r.schedule->>'end'='08:00'
  AND r.schedule->>'timezone'='Asia/Kolkata'
  AND a.title='Person detected'
  AND a.first_detected_at >= (SELECT max(occurred_at) FROM audit_events WHERE action='analytics.after_hours_person_configured')
  AND ((a.first_detected_at AT TIME ZONE 'Asia/Kolkata')::time >= '20:00'::time
    OR (a.first_detected_at AT TIME ZONE 'Asia/Kolkata')::time < '08:00'::time);
UPDATE analytics_alerts a SET title='Person Detected after office hour',updated_at=now()
FROM renamed_person_alerts b WHERE a.id=b.id;
UPDATE incidents i SET title='Person Detected after office hour'
WHERE i.title='Person detected' AND i.id IN (SELECT incident_id FROM renamed_person_alerts);
INSERT INTO audit_events(tenant_id,action,outcome,details)
SELECT '00000000-0000-4000-8000-000000000001','analytics.after_hours_person_alerts_renamed','success',
  jsonb_build_object('requestedBy','user','title','Person Detected after office hour',
    'beforeAlerts',(SELECT jsonb_agg(to_jsonb(b)) FROM renamed_person_alerts b));
COMMIT;
SELECT a.title,a.severity,a.status,count(*) FROM analytics_alerts a JOIN analytics_rules r ON r.id=a.rule_id
WHERE r.tenant_id='00000000-0000-4000-8000-000000000001' AND r.detection_type='person'
  AND r.schedule->>'start'='20:00' AND r.schedule->>'end'='08:00'
GROUP BY a.title,a.severity,a.status;
