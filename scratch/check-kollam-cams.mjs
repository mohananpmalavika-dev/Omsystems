import { execSync } from 'node:child_process';

const sql = `
SELECT 
  c.id,
  c.channel,
  c.status as camera_status,
  c.edge_agent_id,
  ea.name as agent_name,
  ea.status as agent_status,
  ea.last_seen_at as agent_last_seen,
  ea.public_media_url
FROM cameras c
LEFT JOIN edge_agents ea ON c.edge_agent_id = ea.id
WHERE c.branch_node_id = '525198ad-504d-48af-ac6c-dca057d38ed5'
ORDER BY c.channel;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `ssh -i C:\\Users\\Dhanya\\.ssh\\google_compute_engine -o StrictHostKeyChecking=no Dhanya@35.200.130.81 "echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

const res = execSync(cmd, { encoding: 'utf8' });
console.log(res);
