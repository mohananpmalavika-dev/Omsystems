import { execSync } from 'child_process';

const sql = `
SELECT n.id, n.alert_id, n.channel, n.status, a.title
FROM analytics_notifications n
JOIN analytics_alerts a ON n.alert_id = a.id
WHERE a.title ILIKE '%known person%'
LIMIT 10;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo ${base64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
