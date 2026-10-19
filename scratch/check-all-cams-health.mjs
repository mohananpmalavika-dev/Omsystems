import { execSync } from 'child_process';

const sql = `
SELECT 
  c.id as camera_id,
  c.channel,
  b.name as branch_name,
  c.status as camera_status,
  h.metrics->>'status' as health_status,
  h.metrics->>'streamActive' as stream_active,
  h.observed_at,
  h.reason_codes
FROM cameras c
JOIN resource_nodes b ON c.branch_node_id = b.id
LEFT JOIN operational_health_latest h ON (h.device_id = c.id::text AND h.device_type = 'camera')
ORDER BY b.name, c.channel;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
