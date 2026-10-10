import { execSync } from 'child_process';

const sql = `
-- Check resource_nodes schema
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'resource_nodes'
ORDER BY ordinal_position;

-- Check Wizzmoni node and all subnodes
WITH RECURSIVE org_tree AS (
  SELECT id, name, node_type, parent_id, 0 as depth
  FROM resource_nodes
  WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  
  UNION ALL
  
  SELECT rn.id, rn.name, rn.node_type, rn.parent_id, ot.depth + 1
  FROM resource_nodes rn
  JOIN org_tree ot ON rn.parent_id = ot.id
)
SELECT depth, id, name, node_type, parent_id FROM org_tree;

-- Check cameras under Wizzmoni tree
WITH RECURSIVE org_tree AS (
  SELECT id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id FROM resource_nodes rn JOIN org_tree ot ON rn.parent_id = ot.id
)
SELECT c.id as camera_id, c.channel, rn.name as camera_name, c.branch_node_id
FROM cameras c
JOIN resource_nodes rn ON c.resource_node_id = rn.id
WHERE c.resource_node_id IN (SELECT id FROM org_tree)
   OR c.branch_node_id IN (SELECT id FROM org_tree);

-- Check all cameras in the database and their parent/branch nodes to compare
SELECT 
  c.id as camera_id,
  rn.name as camera_name,
  parent.name as parent_name,
  branch.name as branch_name
FROM cameras c
JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN resource_nodes parent ON rn.parent_id = parent.id
LEFT JOIN resource_nodes branch ON c.branch_node_id = branch.id
LIMIT 20;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
