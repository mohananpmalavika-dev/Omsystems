import { execSync } from 'child_process';

const sql = `
SELECT a.id, a.first_detected_at, a.camera_id, a.rule_id, r.name as rule_name, r.detection_type, r.enabled, a.title
FROM analytics_alerts a
LEFT JOIN analytics_rules r ON a.rule_id = r.id
WHERE a.title ILIKE '%known person%'
ORDER BY a.first_detected_at DESC LIMIT 10;
`;
const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
