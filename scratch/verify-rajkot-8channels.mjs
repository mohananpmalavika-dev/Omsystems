import { execSync } from 'child_process';

const sql = `
SELECT id, name, status FROM branches WHERE id = '6ddee070-9050-4f55-aaa1-1190654bbc6b';
SELECT id, branch_id, edge_agent_id, ip_address, username FROM camera_credentials WHERE ip_address = '172.28.36.100';
SELECT c.id, rn.name as camera_name, c.channel, c.status, c.ip_address, c.connection_secret_ref, c.edge_agent_id
FROM cameras c
JOIN resource_nodes rn ON rn.id = c.resource_node_id
WHERE c.branch_node_id = '6ddee070-9050-4f55-aaa1-1190654bbc6b'
ORDER BY c.channel ASC;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
