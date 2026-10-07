import { execSync } from 'child_process';

const sql = process.argv[2] || `
SELECT c.id, c.ip_address, c.channel, c.status, rn.name as node_name
FROM cameras c
LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id
LIMIT 10;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
