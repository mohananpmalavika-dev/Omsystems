import { execSync } from 'node:child_process';

const sql = `
SELECT reference, edge_agent_id 
FROM central_stream_secrets 
WHERE reference LIKE '%61790ac5%' OR reference LIKE '%1f96bfff%' OR reference LIKE '%2e3ecf3b%';
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `ssh -i C:\\Users\\Dhanya\\.ssh\\google_compute_engine -o StrictHostKeyChecking=no Dhanya@34.14.220.41 "echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

const res = execSync(cmd, { encoding: 'utf8' });
console.log(res);
