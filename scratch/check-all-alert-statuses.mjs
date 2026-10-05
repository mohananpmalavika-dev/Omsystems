import { execSync } from 'child_process';

const sql = `
SELECT status, count(*) 
FROM analytics_alerts 
GROUP BY status;

SELECT title, status, count(*) 
FROM analytics_alerts 
WHERE status NOT IN ('resolved', 'false_alarm', 'suppressed')
GROUP BY title, status;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
