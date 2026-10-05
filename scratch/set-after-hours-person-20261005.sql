-- Requested daily window: 20:00 inclusive to 08:00 exclusive, Asia/Kolkata.
-- Uses person detection so both recognised staff and unknown visitors match.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE overnight_person_before ON COMMIT DROP AS
SELECT r.* FROM analytics_rules r
WHERE r.tenant_id = '00000000-0000-4000-8000-000000000001'
  AND r.detection_type = 'person' AND r.archived_at IS NULL;
DO $$ BEGIN
  IF (SELECT count(*) FROM overnight_person_before) <> 43 THEN
    RAISE EXCEPTION 'Unexpected person rule count; inspect configuration before applying';
  END IF;
  IF EXISTS (SELECT 1 FROM overnight_person_before WHERE zone_id IS NOT NULL OR direction <> 'any') THEN
    RAISE EXCEPTION 'Unexpected zone/direction restriction';
  END IF;
  IF EXISTS (SELECT 1 FROM alert_suppression_config
    WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
      AND (detection_type = 'person' OR detection_type IS NULL) AND suppressed) THEN
    RAISE EXCEPTION 'Person alert suppression must be inspected before activation';
  END IF;
END $$;
UPDATE analytics_rules r
SET enabled = true, severity = 'P1',
    schedule = '{"days":[0,1,2,3,4,5,6],"start":"20:00","end":"08:00","timezone":"Asia/Kolkata"}'::jsonb,
    updated_at = now()
FROM overnight_person_before b WHERE r.id = b.id;
INSERT INTO audit_events (tenant_id, action, outcome, details)
SELECT '00000000-0000-4000-8000-000000000001',
  'analytics.after_hours_person_configured', 'success',
  jsonb_build_object('requestedBy', 'user', 'scope', '43 existing camera person rules',
    'reason', 'Any person detected daily from 8 PM to 8 AM IST must generate P1 alerts',
    'schedule', '{"days":[0,1,2,3,4,5,6],"start":"20:00","end":"08:00","timezone":"Asia/Kolkata"}'::jsonb,
    'beforeRules', (SELECT jsonb_agg(to_jsonb(b)) FROM overnight_person_before b),
    'afterRules', (SELECT jsonb_agg(to_jsonb(r)) FROM analytics_rules r JOIN overnight_person_before b ON b.id=r.id));
DO $$ BEGIN
  IF (SELECT count(*) FROM analytics_rules r JOIN overnight_person_before b ON b.id=r.id
    WHERE r.enabled AND r.severity='P1'
      AND r.schedule = '{"days":[0,1,2,3,4,5,6],"start":"20:00","end":"08:00","timezone":"Asia/Kolkata"}'::jsonb) <> 43 THEN
    RAISE EXCEPTION 'Overnight person configuration verification failed';
  END IF;
END $$;
COMMIT;
SELECT bn.name AS branch, count(*) AS configured_cameras, bool_and(r.enabled) AS enabled,
  min(r.severity) AS severity, min(r.schedule::text) AS schedule
FROM analytics_rules r JOIN cameras c ON c.id=r.camera_id JOIN resource_nodes bn ON bn.id=c.branch_node_id
WHERE r.tenant_id='00000000-0000-4000-8000-000000000001' AND r.detection_type='person' AND r.archived_at IS NULL
GROUP BY bn.name ORDER BY bn.name;
