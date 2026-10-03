import { execSync } from 'child_process';

const sql = `SELECT * FROM analytics_rules WHERE id = 'a788bc41-1285-4cb6-8773-8bd7c37abbbb';`;
const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
