import { execSync } from 'child_process';

const sql = `
WITH RECURSIVE org_tree AS (
  SELECT id, name, node_type, parent_id, 0 as depth
  FROM resource_nodes
  WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  
  UNION ALL
  
  SELECT rn.id, rn.name, rn.node_type, rn.parent_id, ot.depth + 1
  FROM resource_nodes rn
  JOIN org_tree ot ON rn.parent_id = ot.id
)
SELECT depth, id, name, node_type, parent_id 
FROM org_tree
WHERE node_type != 'camera' OR depth <= 2
ORDER BY depth, name;

-- Check all branches under Wizzmoni
WITH RECURSIVE org_tree AS (
  SELECT id, name, node_type, parent_id
  FROM resource_nodes
  WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  
  UNION ALL
  
  SELECT rn.id, rn.name, rn.node_type, rn.parent_id
  FROM resource_nodes rn
  JOIN org_tree ot ON rn.parent_id = ot.id
)
SELECT id, name, node_type FROM org_tree WHERE node_type IN ('company', 'region', 'zone', 'branch');
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
