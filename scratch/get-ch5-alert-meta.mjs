import { execSync } from 'child_process';

const sql = `
SELECT * 
FROM analytics_alerts 
WHERE camera_id = '97280c3c-35f4-4f66-8b98-499b125bf3d2' AND title ILIKE '%helmet%'
ORDER BY created_at DESC LIMIT 1;
`;
const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -x"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
