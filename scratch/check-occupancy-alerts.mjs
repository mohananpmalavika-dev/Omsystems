import { execSync } from 'child_process';

const sql = `
SELECT id, detection_type, name, enabled, camera_id FROM analytics_rules WHERE detection_type = 'occupancy-counting';
SELECT id, title, status, first_detected_at, camera_id FROM analytics_alerts WHERE title ILIKE '%occupancy%' ORDER BY first_detected_at DESC LIMIT 10;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
