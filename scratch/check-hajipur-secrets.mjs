import { execSync } from 'child_process';

const sql = `
SELECT reference, edge_agent_id, updated_at FROM central_stream_secrets WHERE reference LIKE '%hajipur%' OR reference LIKE '%dvr%' OR reference LIKE '%172.28%';
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
