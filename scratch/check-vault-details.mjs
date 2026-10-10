import { execSync } from 'child_process';

const sql = `
SELECT c.id as camera_id, c.channel, rn.name as camera_name, b.id as branch_id, b.name as branch_name 
FROM cameras c
JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN resource_nodes b ON c.branch_node_id = b.id
WHERE c.id IN (
  '699e8b00-cfac-4a22-b0f5-802c95f68431',
  '88137ebc-8df1-4995-824a-99bfce6c2225',
  '3da93c6e-6824-43dc-9bba-7332707d5856',
  '3baa601f-67e0-4e0e-905d-0688df725bf1',
  '4d74d7ad-6922-4af0-9f36-420b84879425'
);
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
