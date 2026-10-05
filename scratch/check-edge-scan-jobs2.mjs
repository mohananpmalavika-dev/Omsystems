import { execSync } from 'child_process';

const sql = `
\\d edge_scan_jobs;
SELECT id, edge_agent_id, branch_node_id, status, error, created_at, updated_at 
FROM edge_scan_jobs 
ORDER BY created_at DESC LIMIT 5;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
