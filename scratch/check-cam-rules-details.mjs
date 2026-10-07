import { execSync } from 'child_process';

const sql = `
SELECT id, camera_id, name, detection_type, enabled, min_confidence, object_classes, cooldown_seconds, schedule, archived_at
FROM analytics_rules
WHERE camera_id IN ('fb465a8f-5d79-4a3f-9cb8-b8cec471708d', '3da93c6e-6824-43dc-9bba-7332707d5856');
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
