import { execSync } from 'child_process';

const sql = `
SELECT reference, edge_agent_id, updated_at
FROM central_stream_secrets
WHERE reference ILIKE '%pilot%' OR edge_agent_id = 'e9b95595-1aa6-4a14-9f5d-bd0c958d3f34'
ORDER BY updated_at DESC;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
