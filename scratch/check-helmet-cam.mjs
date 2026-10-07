import { execSync } from 'child_process';

const sql = `
SELECT c.id, c.ip_address, c.channel, c.status, rn.name as node_name
FROM cameras c
LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id
WHERE c.id IN ('fb465a8f-5d79-4a3f-9cb8-b8cec471708d', '3da93c6e-6824-43dc-9bba-7332707d5856');
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
