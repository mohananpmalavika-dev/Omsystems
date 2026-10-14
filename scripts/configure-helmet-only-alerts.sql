-- GCP operator configuration: keep only helmet-worn-inside-branch alerts.
-- Run with psql -v ON_ERROR_STOP=1. The audit entry retains previous settings.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(7184226007);

CREATE TEMP TABLE helmet_only_before ON COMMIT DROP AS
SELECT t.id AS tenant_id, jsonb_build_object(
  'requestedBy', 'user',
  'reason', 'Disable all alerts except helmet worn inside branch',
  'analyticsRules', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',r.id,'enabled',r.enabled,'archivedAt',r.archived_at))
    FROM analytics_rules r WHERE r.tenant_id=t.id), '[]'::jsonb),
  'nbfcRules', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',r.id,'enabled',r.enabled,'state',r.state))
    FROM nbfc_analytics_rules r WHERE r.tenant_id=t.id), '[]'::jsonb),
  'suppression', COALESCE((SELECT jsonb_agg(to_jsonb(s))
    FROM alert_suppression_config s WHERE s.tenant_id=t.id), '[]'::jsonb),
  'activeAlerts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'status',a.status))
    FROM analytics_alerts a JOIN analytics_rules r ON r.id=a.rule_id
    WHERE a.tenant_id=t.id AND r.detection_type IS DISTINCT FROM 'helmet-worn'
      AND a.status IN ('new','acknowledged','investigating','escalated')), '[]'::jsonb),
  'pendingNotifications', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',n.id,'status',n.status))
    FROM analytics_notifications n JOIN analytics_alerts a ON a.id=n.alert_id
    JOIN analytics_rules r ON r.id=a.rule_id WHERE n.tenant_id=t.id
      AND r.detection_type IS DISTINCT FROM 'helmet-worn'
      AND n.status IN ('queued','failed','processing')), '[]'::jsonb)
) AS details FROM tenants t;

CREATE TEMP TABLE helmet_only_scopes ON COMMIT DROP AS
SELECT id AS tenant_id, NULL::text AS branch_id, NULL::text AS camera_id FROM tenants
UNION SELECT tenant_id,branch_id,camera_id FROM alert_suppression_config;

UPDATE analytics_rules SET enabled=false,updated_at=now()
WHERE detection_type IS DISTINCT FROM 'helmet-worn' AND enabled;
UPDATE analytics_rules SET enabled=true,updated_at=now()
WHERE detection_type='helmet-worn' AND archived_at IS NULL AND NOT enabled;
UPDATE nbfc_analytics_rules SET enabled=false,state='INACTIVE',updated_by='user',updated_at=now()
WHERE detector_type IS DISTINCT FROM 'helmet-worn' AND (enabled OR state<>'INACTIVE');
UPDATE nbfc_analytics_rules SET enabled=true,state='ACTIVE',updated_by='user',updated_at=now()
WHERE detector_type='helmet-worn' AND (NOT enabled OR state<>'ACTIVE');

-- Respect camera > branch > tenant precedence: apply the exception at every
-- existing scope so a broader exception cannot lose to a camera-wide mute.
UPDATE alert_suppression_config
SET suppressed=(detection_type IS DISTINCT FROM 'helmet-worn'),updated_by='user',updated_at=now();
INSERT INTO alert_suppression_config
  (tenant_id,branch_id,camera_id,detection_type,suppressed,label,updated_by)
SELECT s.tenant_id,s.branch_id,s.camera_id,v.detection_type,v.suppressed,v.label,'user'
FROM helmet_only_scopes s CROSS JOIN (VALUES
  (NULL::text,true,'All alerts disabled except helmet worn inside branch'),
  ('helmet-worn',false,'Helmet worn inside branch')
) v(detection_type,suppressed,label)
ON CONFLICT (tenant_id,branch_id,camera_id,detection_type)
DO UPDATE SET suppressed=EXCLUDED.suppressed,label=EXCLUDED.label,updated_by='user',updated_at=now();

INSERT INTO alert_suppression_audit
  (suppression_id,tenant_id,branch_id,camera_id,detection_type,suppressed,changed_by,reason)
SELECT id,tenant_id,branch_id,camera_id,detection_type,suppressed,'user',
  'Disable all alerts except helmet worn inside branch'
FROM alert_suppression_config;

-- Mute outstanding alerts and cancel their pending deliveries so they cannot
-- continue escalating after their detection rule has been disabled.
UPDATE analytics_alerts a SET status='suppressed',version=version+1,updated_at=now()
FROM analytics_rules r WHERE r.id=a.rule_id AND r.detection_type IS DISTINCT FROM 'helmet-worn'
  AND a.status IN ('new','acknowledged','investigating','escalated');
UPDATE analytics_notifications n SET status='cancelled',updated_at=now()
FROM analytics_alerts a JOIN analytics_rules r ON r.id=a.rule_id
WHERE n.alert_id=a.id AND r.detection_type IS DISTINCT FROM 'helmet-worn'
  AND n.status IN ('queued','failed','processing');

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM analytics_rules WHERE enabled AND detection_type IS DISTINCT FROM 'helmet-worn')
    OR EXISTS (SELECT 1 FROM nbfc_analytics_rules WHERE enabled AND detector_type IS DISTINCT FROM 'helmet-worn')
    OR EXISTS (SELECT 1 FROM alert_suppression_config WHERE suppressed IS DISTINCT FROM (detection_type IS DISTINCT FROM 'helmet-worn'))
  THEN RAISE EXCEPTION 'Helmet-only policy verification failed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM analytics_rules WHERE enabled AND archived_at IS NULL AND detection_type='helmet-worn')
  THEN RAISE EXCEPTION 'No active helmet-worn rules remain'; END IF;
END $$;

INSERT INTO audit_events (tenant_id,action,outcome,details)
SELECT tenant_id,'alerts.helmet_only.configured','success',details || jsonb_build_object(
  'helmetRulesEnabled',(SELECT count(*) FROM analytics_rules r WHERE r.tenant_id=b.tenant_id AND r.enabled AND r.detection_type='helmet-worn'),
  'configuredAt',now()) FROM helmet_only_before b;

SELECT detection_type,count(*) AS enabled_rules FROM analytics_rules WHERE enabled GROUP BY detection_type;
SELECT detector_type,state,count(*) AS enabled_rules FROM nbfc_analytics_rules WHERE enabled GROUP BY detector_type,state;
SELECT detection_type,suppressed,count(*) AS suppression_settings FROM alert_suppression_config GROUP BY detection_type,suppressed;
SELECT count(*) AS active_non_helmet_alerts FROM analytics_alerts a JOIN analytics_rules r ON r.id=a.rule_id
WHERE r.detection_type IS DISTINCT FROM 'helmet-worn' AND a.status IN ('new','acknowledged','investigating','escalated');
COMMIT;
