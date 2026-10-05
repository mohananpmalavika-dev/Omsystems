import { execSync } from 'node:child_process';

const sql = `
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'central_stream_secrets' 
ORDER BY ordinal_position;

SELECT constraint_name, constraint_type, column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'central_stream_secrets';

SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'central_stream_secrets';
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
