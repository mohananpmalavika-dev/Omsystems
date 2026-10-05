import { execSync } from 'child_process';

const sql = `
SELECT r.id, r.name, r.detection_type, r.enabled, r.camera_id, c.name as camera_name
FROM analytics_rules r
LEFT JOIN cameras c ON r.camera_id = c.id
WHERE r.detection_type = 'face-recognition';
`;
const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
