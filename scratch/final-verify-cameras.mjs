import { execSync } from 'node:child_process';

const sql = `
SELECT b.name as branch_name, c.channel, c.status, c.ip_address, c.edge_agent_id
FROM cameras c
JOIN resource_nodes b ON b.id = c.branch_node_id
WHERE b.name ILIKE '%rajkot%' OR b.name ILIKE '%perav%'
ORDER BY b.name, c.channel;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
