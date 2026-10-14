import { execSync } from 'child_process';

const sql = `
WITH RECURSIVE wizzmoni_tree AS (
  SELECT id, name, node_type, parent_id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id, rn.name, rn.node_type, rn.parent_id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
SELECT 
  b.id as branch_id,
  b.name as branch_name,
  count(c.id) as total_cameras,
  count(c.id) FILTER (WHERE c.status = 'online') as cameras_status_online,
  count(c.id) FILTER (WHERE c.status != 'online' OR c.status IS NULL) as cameras_status_not_online
FROM wizzmoni_tree b
LEFT JOIN cameras c ON (c.branch_node_id = b.id OR c.resource_node_id = b.id)
WHERE b.node_type = 'branch'
GROUP BY b.id, b.name;

-- Also check edge agents
SELECT id, name, status, branch_node_id, last_seen_at FROM edge_agents;

-- Check operational_health_latest summary for Wizzmoni cameras
WITH RECURSIVE wizzmoni_tree AS (
  SELECT id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
SELECT 
  c.status as camera_table_status,
  h.metrics->>'status' as health_status,
  h.metrics->>'streamActive' as stream_active,
  count(*)
FROM cameras c
JOIN resource_nodes b ON (c.branch_node_id = b.id OR c.resource_node_id = b.id)
LEFT JOIN operational_health_latest h ON (h.device_id = c.id::text AND h.device_type = 'camera')
WHERE b.id IN (SELECT id FROM wizzmoni_tree)
GROUP BY c.status, h.metrics->>'status', h.metrics->>'streamActive';
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
