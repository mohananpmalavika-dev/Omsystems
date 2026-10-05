import { execSync } from 'child_process';

const sql = `
SELECT id, command_type, status, result, requested_at, completed_at 
FROM edge_commands 
WHERE id = 'c660140f-d0ca-421c-bf51-e9a0d5d02c06';
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
