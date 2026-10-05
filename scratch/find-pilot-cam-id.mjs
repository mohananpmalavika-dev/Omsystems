import { execSync } from 'child_process';

const sql = `
SELECT c.id, c.model, c.ip_address, c.recorder_channel, c.channel, r.name as node_name, r.id as node_id
FROM cameras c
JOIN resource_nodes r ON r.id = c.resource_node_id
WHERE r.parent_id = '00000000-0000-4000-8000-000000000104'
  AND r.name IN ('CP PLUS DVR - Channel 2', 'CP PLUS DVR - Channel 6');
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
