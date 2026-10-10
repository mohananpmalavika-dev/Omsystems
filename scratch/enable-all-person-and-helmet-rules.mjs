import { execSync } from 'child_process';

const sql = `
BEGIN;

-- 1. Enable all existing 'person' rules and clear archived_at
UPDATE analytics_rules
SET enabled = true,
    archived_at = NULL,
    updated_at = NOW()
WHERE detection_type = 'person';

-- 2. Insert 'person' rule for any camera missing it
INSERT INTO analytics_rules (
  id, tenant_id, camera_id, zone_id, model_id, name, detection_type,
  enabled, schedule, object_classes, min_confidence,
  min_duration_seconds, direction, severity, cooldown_seconds,
  recipients, escalate_after_seconds, recording_policy,
  pre_roll_seconds, post_roll_seconds, created_by, shutter_config,
  created_at, updated_at
)
SELECT 
  gen_random_uuid(),
  COALESCE(node.tenant_id, '00000000-0000-4000-8000-000000000001'::uuid),
  camera.id,
  NULL,
  NULL,
  'AI - Person detection',
  'person',
  true,
  NULL,
  '["person"]'::jsonb,
  0.65,
  0,
  'any',
  'P3',
  60,
  '[]'::jsonb,
  NULL,
  'event-recording',
  30,
  120,
  NULL,
  NULL,
  NOW(),
  NOW()
FROM cameras camera
LEFT JOIN resource_nodes node ON node.id = camera.resource_node_id
WHERE NOT EXISTS (
  SELECT 1 FROM analytics_rules r 
  WHERE r.camera_id = camera.id AND r.detection_type = 'person'
);

-- 3. Enable all existing 'helmet-worn' rules and clear archived_at
UPDATE analytics_rules
SET enabled = true,
    archived_at = NULL,
    updated_at = NOW()
WHERE detection_type = 'helmet-worn';

-- 4. Insert 'helmet-worn' rule for any camera missing it (just in case)
INSERT INTO analytics_rules (
  id, tenant_id, camera_id, zone_id, model_id, name, detection_type,
  enabled, schedule, object_classes, min_confidence,
  min_duration_seconds, direction, severity, cooldown_seconds,
  recipients, escalate_after_seconds, recording_policy,
  pre_roll_seconds, post_roll_seconds, created_by, shutter_config,
  created_at, updated_at
)
SELECT 
  gen_random_uuid(),
  COALESCE(node.tenant_id, '00000000-0000-4000-8000-000000000001'::uuid),
  camera.id,
  NULL,
  NULL,
  'AI - Helmet worn inside bank',
  'helmet-worn',
  true,
  NULL,
  '["helmet", "person"]'::jsonb,
  0.70,
  1,
  'any',
  'P2',
  60,
  '[]'::jsonb,
  NULL,
  'event-recording',
  30,
  120,
  NULL,
  NULL,
  NOW(),
  NOW()
FROM cameras camera
LEFT JOIN resource_nodes node ON node.id = camera.resource_node_id
WHERE NOT EXISTS (
  SELECT 1 FROM analytics_rules r 
  WHERE r.camera_id = camera.id AND r.detection_type = 'helmet-worn'
);

-- 5. Remove any alert suppression for 'person' or 'helmet-worn'
DELETE FROM alert_suppression_config 
WHERE detection_type IN ('person', 'helmet-worn');

COMMIT;

-- VERIFICATION
SELECT 
  'Total Cameras' AS metric,
  COUNT(*)::text AS count
FROM cameras
UNION ALL
SELECT 
  'Person Rules Enabled' AS metric,
  COUNT(*)::text AS count
FROM analytics_rules
WHERE detection_type = 'person' AND enabled = true AND archived_at IS NULL
UNION ALL
SELECT 
  'Helmet Rules Enabled' AS metric,
  COUNT(*)::text AS count
FROM analytics_rules
WHERE detection_type = 'helmet-worn' AND enabled = true AND archived_at IS NULL
UNION ALL
SELECT 
  'Cameras Missing Person Rule' AS metric,
  COUNT(*)::text AS count
FROM cameras c
WHERE NOT EXISTS (
  SELECT 1 FROM analytics_rules r 
  WHERE r.camera_id = c.id AND r.detection_type = 'person' AND r.enabled = true AND r.archived_at IS NULL
)
UNION ALL
SELECT 
  'Cameras Missing Helmet Rule' AS metric,
  COUNT(*)::text AS count
FROM cameras c
WHERE NOT EXISTS (
  SELECT 1 FROM analytics_rules r 
  WHERE r.camera_id = c.id AND r.detection_type = 'helmet-worn' AND r.enabled = true AND r.archived_at IS NULL
);
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log('=== ENABLING PERSON AND HELMET RULES FOR ALL CAMERAS ===');
console.log(execSync(cmd, { encoding: 'utf8' }));
