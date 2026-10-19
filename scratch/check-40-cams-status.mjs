import { execSync } from 'child_process';

const sql = `
SELECT 
  b.name as branch_name,
  count(c.id) as total_cameras,
  count(c.id) FILTER (WHERE c.status = 'online') as online_status,
  count(c.id) FILTER (WHERE h.metrics->>'streamActive' = 'true') as stream_active,
  count(rp.id) FILTER (WHERE rp.enabled = true) as person_rules_enabled,
  count(rh.id) FILTER (WHERE rh.enabled = true) as helmet_rules_enabled
FROM cameras c
LEFT JOIN resource_nodes b ON c.branch_node_id = b.id
LEFT JOIN operational_health_latest h ON (h.device_id = c.id::text AND h.device_type = 'camera')
LEFT JOIN analytics_rules rp ON (rp.camera_id = c.id AND rp.detection_type = 'person' AND rp.enabled = true AND rp.archived_at IS NULL)
LEFT JOIN analytics_rules rh ON (rh.camera_id = c.id AND rh.detection_type = 'helmet-worn' AND rh.enabled = true AND rh.archived_at IS NULL)
GROUP BY b.name
ORDER BY b.name;

SELECT 
  c.status,
  count(*)
FROM cameras c
GROUP BY c.status;

SELECT 
  rn.is_active,
  count(*)
FROM cameras c
JOIN resource_nodes rn ON c.resource_node_id = rn.id
GROUP BY rn.is_active;

SELECT 
  count(*) as total_cameras,
  count(*) FILTER (WHERE c.status = 'online') as online_cameras,
  count(*) FILTER (WHERE h.metrics->>'status' = 'online') as health_online,
  count(*) FILTER (WHERE h.metrics->>'streamActive' = 'true') as stream_active
FROM cameras c
LEFT JOIN operational_health_latest h ON (h.device_id = c.id::text AND h.device_type = 'camera');
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
