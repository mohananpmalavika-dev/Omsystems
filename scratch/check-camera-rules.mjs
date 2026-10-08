import { execSync } from 'child_process';

const sql = `
SELECT c.id, c.channel, rn.name, c.ip_address, c.branch_node_id
FROM cameras c
JOIN resource_nodes rn ON c.resource_node_id = rn.id
WHERE c.id IN ('3da93c6e-6824-43dc-9bba-7332707d5856', 'fb465a8f-5d79-4a3f-9cb8-b8cec471708d', '0f545b49-8d4c-4999-83ab-567fc9e3309c', 'e66e3498-1c13-4f59-91d7-5a3386d269d2', 'e51113dd-d8c7-4d8b-8df9-267edeae7c94');

SELECT c.id, c.channel, rn.name, c.ip_address, c.status, c.last_seen_at
FROM cameras c
JOIN resource_nodes rn ON c.resource_node_id = rn.id
WHERE c.branch_node_id = '00000000-0000-4000-8000-000000000104';
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
