import { execSync } from 'child_process';

const ids = [
  '685b12a8-648a-4c74-99fa-55d903a63525',
  '240c7480-49fa-46ae-8656-d4a7928da41d',
  '21798e41-798e-4fb5-a41f-3346e3b7cf9f',
  '0d76b855-758b-4c65-aa93-7c26acc5d853',
  '98bd1b87-4a62-4b1b-ac6b-4fea893f0eaa',
  '683224d1-b48b-49f3-9589-8902568589c8',
  '54068b7c-4d98-4a40-85dd-a86bc696463b',
];

const sql = `
SELECT c.id, c.channel, c.ip_address, c.recorder_channel, rn.name as rn_name, b.name as branch_name, c.edge_agent_id
FROM cameras c
LEFT JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN branches b ON c.branch_node_id = b.id
WHERE c.id IN (${ids.map(id => `'${id}'`).join(',')});
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
