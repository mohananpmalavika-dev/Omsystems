import { execSync } from 'child_process';

const sql = `
WITH RECURSIVE wizzmoni_tree AS (
  SELECT id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
SELECT count(*) as wizzmoni_camera_count
FROM cameras c
WHERE c.resource_node_id IN (SELECT id FROM wizzmoni_tree)
   OR c.branch_node_id IN (SELECT id FROM wizzmoni_tree);

-- Check active alerts for Wizzmoni
WITH RECURSIVE wizzmoni_tree AS (
  SELECT id FROM resource_nodes WHERE id = 'a7130bc7-3a43-4ddb-9c74-736ddb40ea3c'
  UNION ALL
  SELECT rn.id FROM resource_nodes rn JOIN wizzmoni_tree wt ON rn.parent_id = wt.id
)
SELECT a.id, a.title, a.status, a.camera_id, rn.name as camera_name
FROM analytics_alerts a
JOIN cameras c ON a.camera_id = c.id
JOIN resource_nodes rn ON c.resource_node_id = rn.id
WHERE (c.resource_node_id IN (SELECT id FROM wizzmoni_tree) OR c.branch_node_id IN (SELECT id FROM wizzmoni_tree))
  AND (a.title ILIKE '%person%' OR a.detection_signature->>'detectionType' = 'person')
  AND a.status IN ('new', 'acknowledged', 'investigating')
LIMIT 10;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
