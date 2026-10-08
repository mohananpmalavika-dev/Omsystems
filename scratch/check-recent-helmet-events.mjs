import { execSync } from 'child_process';

const sql = `
SELECT e.id, c.channel, rn.name as camera_name, e.detection_type, e.occurred_at, e.confidence
FROM analytics_events e
JOIN cameras c ON c.id = e.camera_id
JOIN resource_nodes rn ON c.resource_node_id = rn.id
WHERE c.branch_node_id = '00000000-0000-4000-8000-000000000104'
ORDER BY e.occurred_at DESC
LIMIT 15;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
