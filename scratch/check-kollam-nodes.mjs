import { execSync } from 'child_process';

const sql = `
SELECT rn.id, rn.name, rn.parent_id, rn.path, c.id as camera_id, c.channel, c.status
FROM cameras c
JOIN resource_nodes rn ON c.resource_node_id = rn.id
WHERE c.branch_node_id = '525198ad-504d-48af-ac6c-dca057d38ed5'
ORDER BY c.channel;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
