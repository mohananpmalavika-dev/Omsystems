import { execSync } from 'child_process';

const sql = `
SELECT id, ip_address, recorder_channel, status, manufacturer, model, vendor, discovered_at, display_name 
FROM camera_discoveries 
WHERE discovered_at >= '2026-10-05 08:50:00' 
ORDER BY discovered_at DESC;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
