import { execSync } from 'child_process';

const sql = `
SELECT id, branch_id, edge_agent_id, ip_address, username, scope, created_at
FROM camera_credentials
WHERE branch_id = '00000000-0000-4000-8000-000000000104';
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
