import { execSync } from 'node:child_process';

const sql = `
SELECT 
  b.name as branch, 
  c.recorder_channel, 
  c.id as camera_id,
  c.resource_node_id,
  c.edge_agent_id,
  c.connection_secret_ref,
  c.status
FROM cameras c 
JOIN branches b ON c.branch_node_id = b.id 
ORDER BY b.name, c.recorder_channel;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `ssh -i C:\\Users\\Dhanya\\.ssh\\google_compute_engine -o StrictHostKeyChecking=no Dhanya@34.14.220.41 "echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

const res = execSync(cmd, { encoding: 'utf8' });
console.log(res);
