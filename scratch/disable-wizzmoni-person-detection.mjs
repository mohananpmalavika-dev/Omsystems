import { execSync } from 'child_process';

const sql = `
BEGIN;

-- 1. Identify all Wizzmoni cameras using recursive CTE
CREATE TEMP TABLE wizzmoni_cameras ON COMMIT DROP AS
WITH RECURSIVE wizzmoni_tree AS (
  SELECT id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
SELECT DISTINCT c.id as camera_id, c.branch_node_id, node.tenant_id
FROM cameras c
LEFT JOIN resource_nodes node ON c.resource_node_id = node.id
WHERE c.resource_node_id IN (SELECT id FROM wizzmoni_tree)
   OR c.branch_node_id IN (SELECT id FROM wizzmoni_tree);

-- 2. Disable 'person' detection rules for all Wizzmoni cameras
UPDATE analytics_rules
SET enabled = false,
    updated_at = NOW()
WHERE detection_type = 'person'
  AND camera_id IN (SELECT camera_id FROM wizzmoni_cameras);

-- 3. Add suppression config for Wizzmoni branches and cameras
-- 3a. Branch-level suppression for all Wizzmoni branches
INSERT INTO alert_suppression_config (id, tenant_id, branch_id, camera_id, detection_type, suppressed, label, updated_by, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  COALESCE(wc.tenant_id, '00000000-0000-4000-8000-000000000001'::uuid),
  wc.branch_node_id,
  NULL,
  'person',
  true,
  'Wizzmoni Person Detection Suppressed',
  'user',
  NOW(),
  NOW()
FROM (SELECT DISTINCT branch_node_id, tenant_id FROM wizzmoni_cameras WHERE branch_node_id IS NOT NULL) wc
ON CONFLICT (tenant_id, branch_id, camera_id, detection_type)
DO UPDATE SET suppressed = true, updated_at = NOW();

-- 3b. Camera-level suppression for all Wizzmoni cameras
INSERT INTO alert_suppression_config (id, tenant_id, branch_id, camera_id, detection_type, suppressed, label, updated_by, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  COALESCE(wc.tenant_id, '00000000-0000-4000-8000-000000000001'::uuid),
  wc.branch_node_id,
  wc.camera_id,
  'person',
  true,
  'Wizzmoni Person Detection Suppressed',
  'user',
  NOW(),
  NOW()
FROM wizzmoni_cameras wc
ON CONFLICT (tenant_id, branch_id, camera_id, detection_type)
DO UPDATE SET suppressed = true, updated_at = NOW();

-- 4. Resolve active 'Person detected' alerts for Wizzmoni cameras
UPDATE analytics_alerts
SET status = 'resolved',
    resolved_at = NOW(),
    updated_at = NOW()
WHERE camera_id IN (SELECT camera_id FROM wizzmoni_cameras)
  AND (title = 'Person detected' OR title ILIKE '%person detected%' OR detection_signature->>'detectionType' = 'person')
  AND status IN ('new', 'acknowledged', 'investigating');

COMMIT;

-- VERIFICATION
SELECT 
  'Wizzmoni Total Cameras' as metric,
  COUNT(DISTINCT camera_id)::text as count
FROM (
  WITH RECURSIVE wizzmoni_tree AS (
    SELECT id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
    UNION ALL
    SELECT rn.id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
  )
  SELECT c.id as camera_id
  FROM cameras c
  WHERE c.resource_node_id IN (SELECT id FROM wizzmoni_tree)
     OR c.branch_node_id IN (SELECT id FROM wizzmoni_tree)
) w;

SELECT 
  'Wizzmoni Person Rules Enabled' as metric,
  COUNT(*)::text as count
FROM analytics_rules r
JOIN (
  WITH RECURSIVE wizzmoni_tree AS (
    SELECT id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
    UNION ALL
    SELECT rn.id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
  )
  SELECT c.id as camera_id
  FROM cameras c
  WHERE c.resource_node_id IN (SELECT id FROM wizzmoni_tree)
     OR c.branch_node_id IN (SELECT id FROM wizzmoni_tree)
) w ON r.camera_id = w.camera_id
WHERE r.detection_type = 'person' AND r.enabled = true;

SELECT 
  'Wizzmoni Person Rules Disabled' as metric,
  COUNT(*)::text as count
FROM analytics_rules r
JOIN (
  WITH RECURSIVE wizzmoni_tree AS (
    SELECT id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
    UNION ALL
    SELECT rn.id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
  )
  SELECT c.id as camera_id
  FROM cameras c
  WHERE c.resource_node_id IN (SELECT id FROM wizzmoni_tree)
     OR c.branch_node_id IN (SELECT id FROM wizzmoni_tree)
) w ON r.camera_id = w.camera_id
WHERE r.detection_type = 'person' AND r.enabled = false;

SELECT 
  'OM Systems Person Rules Enabled' as metric,
  COUNT(*)::text as count
FROM analytics_rules r
WHERE r.detection_type = 'person' AND r.enabled = true;

SELECT 
  'Helmet Rules Enabled (All Cameras)' as metric,
  COUNT(*)::text as count
FROM analytics_rules r
WHERE r.detection_type = 'helmet-worn' AND r.enabled = true;

SELECT 
  'Wizzmoni Active Person Alerts Remaining' as metric,
  COUNT(*)::text as count
FROM analytics_alerts a
JOIN (
  WITH RECURSIVE wizzmoni_tree AS (
    SELECT id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
    UNION ALL
    SELECT rn.id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
  )
  SELECT c.id as camera_id
  FROM cameras c
  WHERE c.resource_node_id IN (SELECT id FROM wizzmoni_tree)
     OR c.branch_node_id IN (SELECT id FROM wizzmoni_tree)
) w ON a.camera_id = w.camera_id
WHERE (a.title = 'Person detected' OR a.title ILIKE '%person detected%' OR a.detection_signature->>'detectionType' = 'person')
  AND a.status IN ('new', 'acknowledged', 'investigating');
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log('=== DISABLING PERSON DETECTION ALERTS IN WIZZMONI ORGANIZATION ===');
console.log(execSync(cmd, { encoding: 'utf8' }));
