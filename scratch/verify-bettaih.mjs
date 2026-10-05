import { execSync } from 'child_process';

const sql = `
SELECT 
  c.id as camera_id,
  rn.name as node_name,
  c.channel,
  c.recorder_channel,
  c.ip_address,
  c.status,
  c.connection_secret_ref,
  di.id as device_identity_id
FROM cameras c
JOIN resource_nodes rn ON rn.id = c.resource_node_id
LEFT JOIN device_identities di ON di.id = c.device_identity_id
WHERE c.branch_node_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9'
ORDER BY c.recorder_channel ASC NULLS LAST;

SELECT reference, edge_agent_id, updated_at
FROM central_stream_secrets
WHERE reference LIKE '%bettaih%' OR reference LIKE '%dvr-ch8%'
ORDER BY reference;

SELECT id, branch_id, edge_agent_id, ip_address, username, scope
FROM camera_credentials
WHERE branch_id = 'd7b23dee-9814-48c9-8805-48b61b33e3a9';
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
