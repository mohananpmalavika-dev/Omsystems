import { execSync } from 'child_process';

const sql = `
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'central_stream_secrets';

SELECT edge_agent_id, reference
FROM central_stream_secrets
WHERE reference LIKE '%2d8053f1%'
   OR reference LIKE '%e66e3498%'
   OR edge_agent_id IN ('e9b95595-1aa6-4a14-9f5d-bd0c958d3f34', 'b950f232-557e-42cd-8bc8-8f4490d0b68b');
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
