import { execSync } from 'child_process';

const query = `
SELECT r.id as rule_id, r.name as rule_name, r.detection_type, r.enabled, r.camera_id, r.cooldown_seconds,
       c.channel, rn.name as camera_name
FROM analytics_rules r
JOIN cameras c ON r.camera_id = c.id
JOIN resource_nodes rn ON c.resource_node_id = rn.id
WHERE r.enabled = true AND (r.detection_type = 'helmet-worn' OR r.name LIKE '%Helmet%' OR r.name LIKE '%helmet%');
`;

const b64 = Buffer.from(query).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
