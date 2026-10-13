import { execSync } from 'child_process';

const sql = `
-- 1. all edge agents
SELECT id, name, version, agent_version, status, branch_node_id, last_seen_at FROM edge_agents;

-- 2. camera columns
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'cameras' ORDER BY ordinal_position;

-- 3. all cameras under Wizzmoni
WITH RECURSIVE wizzmoni_tree AS (
  SELECT id, name, node_type FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id, rn.name, rn.node_type FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
SELECT c.id as camera_id, c.channel, c.edge_agent_id, rn.name as camera_name, branch.name as branch_name, rn.is_active
FROM cameras c
JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN resource_nodes branch ON c.branch_node_id = branch.id
WHERE c.resource_node_id IN (SELECT id FROM wizzmoni_tree) OR c.branch_node_id IN (SELECT id FROM wizzmoni_tree);
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
