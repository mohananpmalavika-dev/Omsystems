import { execSync } from 'child_process';

const sql = `
SELECT c.id, c.channel, b.name as branch_name, c.status
FROM cameras c
JOIN branches b ON c.branch_node_id = b.id
WHERE b.name ILIKE '%hajipur%' AND c.channel = 1;

SELECT r.id, r.name, r.detection_type, r.enabled, r.min_confidence, r.cooldown_seconds
FROM analytics_rules r
JOIN cameras c ON r.camera_id = c.id
JOIN branches b ON c.branch_node_id = b.id
WHERE b.name ILIKE '%hajipur%' AND c.channel = 1;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
