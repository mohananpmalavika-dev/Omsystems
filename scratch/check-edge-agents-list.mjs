import { execSync } from 'node:child_process';

const sql = `
SELECT 
  ea.id,
  ea.name,
  ea.status,
  ea.public_media_url,
  ea.local_media_url,
  ea.last_seen_at,
  b.name as home_branch,
  ea.branch_node_id
FROM edge_agents ea
LEFT JOIN branches b ON ea.branch_node_id = b.id;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `ssh -i C:\\Users\\Dhanya\\.ssh\\google_compute_engine -o StrictHostKeyChecking=no Dhanya@34.14.220.41 "echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

const res = execSync(cmd, { encoding: 'utf8' });
console.log(res);
