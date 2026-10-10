import { execSync } from 'child_process';

const sql = `
SELECT 
  tenant_id,
  branch_id,
  camera_id IS NOT NULL as has_camera,
  detection_type,
  suppressed,
  count(*)
FROM alert_suppression_config
WHERE detection_type = 'person'
GROUP BY tenant_id, branch_id, (camera_id IS NOT NULL), detection_type, suppressed;

SELECT 
  detection_type,
  enabled,
  count(*)
FROM analytics_rules
WHERE detection_type IN ('person', 'helmet-worn')
GROUP BY detection_type, enabled;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
