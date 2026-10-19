import { execSync } from "node:child_process";

const sql = `
-- Get South Zone node details
SELECT id, name, node_type, parent_id, path, is_active
FROM resource_nodes 
WHERE id = '6757edc5-70a8-4412-ada1-1882dcc03513' OR name ILIKE '%south%';

-- Get all child nodes of South Zone (recursive)
WITH RECURSIVE south_tree AS (
  SELECT id, name, node_type, parent_id, path, is_active
  FROM resource_nodes 
  WHERE id = '6757edc5-70a8-4412-ada1-1882dcc03513'
  UNION ALL
  SELECT rn.id, rn.name, rn.node_type, rn.parent_id, rn.path, rn.is_active
  FROM resource_nodes rn 
  JOIN south_tree st ON rn.parent_id = st.id
)
SELECT id, name, node_type, parent_id, is_active FROM south_tree ORDER BY node_type, name;

-- Get all cameras associated with south_tree branches or nodes
WITH RECURSIVE south_tree AS (
  SELECT id, name, node_type, parent_id
  FROM resource_nodes 
  WHERE id = '6757edc5-70a8-4412-ada1-1882dcc03513'
  UNION ALL
  SELECT rn.id, rn.name, rn.node_type, rn.parent_id
  FROM resource_nodes rn 
  JOIN south_tree st ON rn.parent_id = st.id
)
SELECT 
  c.id as camera_id,
  c.name as camera_name,
  c.status as camera_status,
  c.channel,
  c.ip_address,
  c.branch_node_id,
  b.name as branch_name,
  rn.is_active as resource_node_active,
  ohl.metrics->>'status' as health_status,
  ohl.metrics->>'streamActive' as stream_active
FROM cameras c
JOIN south_tree b ON c.branch_node_id = b.id
LEFT JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN operational_health_latest ohl ON (ohl.device_id = c.id::text AND ohl.device_type = 'camera')
ORDER BY b.name, c.channel;
`;

const b64 = Buffer.from(sql).toString("base64");
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: "utf8" }));
