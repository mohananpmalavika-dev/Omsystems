import { execSync } from 'child_process';

const sql = `
SELECT c.id, c.channel, c.ip_address, c.edge_agent_id, c.branch_node_id, c.recorder_id, rn.name as rn_name, c.last_seen_at
FROM cameras c
LEFT JOIN resource_nodes rn ON c.resource_node_id = rn.id
WHERE c.edge_agent_id = 'e9b95595-1aa6-4a14-9f5d-bd0c958d3f34'
   OR c.ip_address IN ('192.168.29.170', '192.168.29.171', '192.168.29.58')
   OR c.recorder_id ILIKE '%192.168.29.%'
ORDER BY c.channel;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
