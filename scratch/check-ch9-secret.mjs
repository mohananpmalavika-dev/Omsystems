import { execSync } from 'child_process';

const sql = `
SELECT edge_agent_id, reference
FROM central_stream_secrets
WHERE reference LIKE '%2d8053f1-af9f-40df-94d3-3e432e13bd85%';
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
