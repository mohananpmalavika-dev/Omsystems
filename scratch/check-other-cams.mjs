import { execSync } from 'child_process';

const sql = `
WITH RECURSIVE wizzmoni_tree AS (
  SELECT id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
SELECT 
  c.id, c.channel, rn.name as camera_name, c.branch_node_id, 
  bn.name as branch_name, 
  pn.name as parent_name,
  c.resource_node_id IN (SELECT id FROM wizzmoni_tree) as res_in_wizz,
  c.branch_node_id IN (SELECT id FROM wizzmoni_tree) as branch_in_wizz
FROM cameras c
LEFT JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN resource_nodes bn ON c.branch_node_id = bn.id
LEFT JOIN resource_nodes pn ON rn.parent_id = pn.id
WHERE NOT (c.resource_node_id IN (SELECT id FROM wizzmoni_tree) OR c.branch_node_id IN (SELECT id FROM wizzmoni_tree));
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
