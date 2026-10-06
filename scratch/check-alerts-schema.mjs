import { execSync } from 'child_process';

const sql = `
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'analytics_alerts'
ORDER BY ordinal_position;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo ${base64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
