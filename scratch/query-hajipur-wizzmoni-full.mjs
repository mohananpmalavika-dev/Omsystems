import { execSync } from 'child_process';

const sql = `
-- 1. Check Hajipur Scanner agent details
SELECT id, name, version, agent_version, desired_agent_version, status, branch_node_id, tenant_id, last_seen_at 
FROM edge_agents 
WHERE name = 'Hajipur Scanner';

-- 2. Find Wizzmoni organization and all branches under it
WITH RECURSIVE wizzmoni_tree AS (
  SELECT id, name, node_type, parent_id, tenant_id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id, rn.name, rn.node_type, rn.parent_id, rn.tenant_id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
SELECT id, name, node_type, parent_id, tenant_id FROM wizzmoni_tree WHERE node_type = 'branch';

-- 3. Find all cameras under Wizzmoni tree
WITH RECURSIVE wizzmoni_tree AS (
  SELECT id, name, node_type FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id, rn.name, rn.node_type FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
SELECT c.id, c.channel, c.status, c.edge_agent_id, c.branch_node_id, rn.name as camera_name, b.name as branch_name
FROM cameras c
JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN resource_nodes b ON c.branch_node_id = b.id
WHERE c.resource_node_id IN (SELECT id FROM wizzmoni_tree) OR c.branch_node_id IN (SELECT id FROM wizzmoni_tree);
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
