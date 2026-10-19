import { execSync } from 'child_process';

const sql = `
SELECT u.id, u.username, u.email, u.role, u.scope_node_id, rn.name as scope_name
FROM users u
LEFT JOIN resource_nodes rn ON u.scope_node_id = rn.id
WHERE u.username = 'test';

WITH RECURSIVE user_tree AS (
  SELECT id, name FROM resource_nodes WHERE id = (SELECT scope_node_id FROM users WHERE username = 'test')
  UNION ALL
  SELECT rn.id, rn.name FROM resource_nodes rn JOIN user_tree ut ON rn.parent_id = ut.id
)
SELECT b.name as branch_name, count(c.id) as cameras_count
FROM cameras c
JOIN resource_nodes b ON c.branch_node_id = b.id
WHERE c.branch_node_id IN (SELECT id FROM user_tree)
GROUP BY b.name;

SELECT b.name as branch_name, count(c.id) as cameras_count
FROM cameras c
JOIN resource_nodes b ON c.branch_node_id = b.id
GROUP BY b.name;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
