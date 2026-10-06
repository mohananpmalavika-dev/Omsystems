import { execSync } from 'node:child_process';

const sql = `
SELECT 
  t.observed_at,
  t.received_at,
  t.edge_agent_id,
  b.name as branch,
  c.recorder_channel,
  t.source,
  t.reason_codes,
  t.idempotency_key
FROM operational_health_telemetry t
JOIN cameras c ON t.device_id = c.id::text
JOIN branches b ON c.branch_node_id = b.id
ORDER BY t.received_at DESC
LIMIT 10;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `ssh -i C:\\Users\\Dhanya\\.ssh\\google_compute_engine -o StrictHostKeyChecking=no Dhanya@34.14.220.41 "echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

const res = execSync(cmd, { encoding: 'utf8' });
console.log(res);
