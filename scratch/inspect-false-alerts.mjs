import { execSync } from 'child_process';

const sql = `
SELECT COUNT(*) FROM alerts;
SELECT status, count(*) FROM alerts GROUP BY status;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

try {
  console.log(execSync(cmd, { encoding: 'utf8' }));
} catch (e) {
  console.error(e.stdout || e.message);
}






