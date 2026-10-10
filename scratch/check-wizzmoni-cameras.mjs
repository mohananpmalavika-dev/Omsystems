import { execSync } from 'child_process';

const sql = `
WITH RECURSIVE wizzmoni_tree AS (
  SELECT id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
SELECT 
  CASE 
    WHEN c.resource_node_id IN (SELECT id FROM wizzmoni_tree) OR c.branch_node_id IN (SELECT id FROM wizzmoni_tree) THEN 'Wizzmoni'
    ELSE 'OM Systems'
  END as company,
  count(DISTINCT c.id) as camera_count
FROM cameras c
GROUP BY 1;

-- List cameras in Wizzmoni
WITH RECURSIVE wizzmoni_tree AS (
  SELECT id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
SELECT 
  c.id as camera_id,
  c.channel,
  rn.name as camera_name,
  branch.name as branch_name,
  rp.enabled as person_enabled
FROM cameras c
JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN resource_nodes branch ON c.branch_node_id = branch.id
LEFT JOIN analytics_rules rp ON rp.camera_id = c.id AND rp.detection_type = 'person'
WHERE c.resource_node_id IN (SELECT id FROM wizzmoni_tree)
   OR c.branch_node_id IN (SELECT id FROM wizzmoni_tree)
ORDER BY branch.name, c.channel;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
