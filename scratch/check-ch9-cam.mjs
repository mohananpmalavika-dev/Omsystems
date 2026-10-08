import { execSync } from 'child_process';

const sql = `
SELECT c.id, c.channel, c.recorder_channel, c.status, c.last_seen_at, c.ip_address, c.edge_agent_id, c.connection_secret_ref, rn.name
FROM cameras c
JOIN resource_nodes rn ON c.resource_node_id = rn.id
WHERE c.id = 'e66e3498-1c13-4f59-91d7-5a3386d269d2';

SELECT *
FROM analytics_rules
WHERE camera_id = 'e66e3498-1c13-4f59-91d7-5a3386d269d2' AND detection_type = 'helmet-worn';
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
