import { execSync } from 'node:child_process';

const sql = `
SELECT 
  b.name as branch, 
  c.recorder_channel, 
  c.status as cam_status,
  h.quality,
  h.reason_codes,
  h.metrics->>'status' as metric_status,
  h.metrics->>'severeBlur' as severe_blur,
  h.metrics->>'videoLoss' as video_loss,
  h.metrics->>'streamActive' as stream_active
FROM cameras c 
JOIN branches b ON c.branch_node_id = b.id 
LEFT JOIN operational_health_latest h ON c.id::text = h.device_id
WHERE c.status != 'online' OR h.quality != 'verified' OR h.metrics->>'status' != 'online'
ORDER BY b.name, c.recorder_channel;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `ssh -i C:\\Users\\Dhanya\\.ssh\\google_compute_engine -o StrictHostKeyChecking=no Dhanya@34.14.220.41 "echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

const res = execSync(cmd, { encoding: 'utf8' });
console.log(res);
