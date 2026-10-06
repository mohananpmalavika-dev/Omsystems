import { execSync } from 'node:child_process';

const sql = `
SELECT 
  b.id as branch_id,
  b.name as branch_name,
  cc.ip_address,
  cc.username,
  cc.password,
  cc.scope
FROM branches b
LEFT JOIN camera_credentials cc ON b.id = cc.branch_id;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `ssh -i C:\\Users\\Dhanya\\.ssh\\google_compute_engine -o StrictHostKeyChecking=no Dhanya@34.14.220.41 "echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

const res = execSync(cmd, { encoding: 'utf8' });
console.log(res);
