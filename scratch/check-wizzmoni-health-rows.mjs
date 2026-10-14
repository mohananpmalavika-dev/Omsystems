import { execSync } from 'child_process';

const sql = `
WITH RECURSIVE wizzmoni_tree AS (
  SELECT id, name, node_type FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id, rn.name, rn.node_type FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
SELECT 
  c.id as camera_id,
  rn.name as camera_name,
  b.name as branch_name,
  c.status as camera_status,
  h.device_id as health_device_id,
  h.observed_at as health_observed_at,
  now() - h.observed_at as health_age,
  h.metrics->>'status' as metric_status,
  h.metrics->>'streamActive' as metric_stream_active,
  h.reason_codes
FROM cameras c
JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN resource_nodes b ON c.branch_node_id = b.id
LEFT JOIN operational_health_latest h ON (h.device_id = c.id::text AND h.device_type = 'camera')
WHERE c.branch_node_id IN (SELECT id FROM wizzmoni_tree)
ORDER BY b.name, c.channel;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
