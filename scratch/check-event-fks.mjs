import { execSync } from 'child_process';

const sql = `
SELECT conrelid::regclass AS table_name, confrelid::regclass AS referenced_table, pg_get_constraintdef(c.oid)
FROM pg_constraint c
WHERE confrelid = 'analytics_events'::regclass;

SELECT count(*) FROM analytics_alerts WHERE event_id IN ('18eb0910-9d96-4b9b-8ed8-56483d1049bc', 'd68b286c-52e7-4cc4-b26f-463efc7e0f2b', '13ce7126-5564-4da8-b279-d58c1b096c96');
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
