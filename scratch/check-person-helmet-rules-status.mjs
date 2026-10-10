import { execSync } from 'child_process';

const sql = `
-- 1. Total cameras
SELECT count(*) AS total_cameras FROM cameras;

-- 2. Rules breakdown for person and helmet-worn
SELECT detection_type, enabled, count(*) 
FROM analytics_rules 
WHERE detection_type IN ('person', 'helmet-worn')
GROUP BY detection_type, enabled;

-- 3. Alert suppression status
SELECT tenant_id, branch_id, camera_id, detection_type, suppressed, label 
FROM alert_suppression_config 
WHERE detection_type IN ('person', 'helmet-worn');

-- 4. Cameras missing person or helmet-worn rule
SELECT c.id, c.name,
  EXISTS(SELECT 1 FROM analytics_rules r WHERE r.camera_id = c.id AND r.detection_type = 'person') as has_person_rule,
  EXISTS(SELECT 1 FROM analytics_rules r WHERE r.camera_id = c.id AND r.detection_type = 'person' AND r.enabled = true) as person_enabled,
  EXISTS(SELECT 1 FROM analytics_rules r WHERE r.camera_id = c.id AND r.detection_type = 'helmet-worn') as has_helmet_rule,
  EXISTS(SELECT 1 FROM analytics_rules r WHERE r.camera_id = c.id AND r.detection_type = 'helmet-worn' AND r.enabled = true) as helmet_enabled
FROM cameras c
ORDER BY c.created_at;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
