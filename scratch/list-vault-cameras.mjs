import { execSync } from 'child_process';

const sql = `
SELECT 
  c.id, 
  c.channel, 
  rn.name as camera_name, 
  b.name as branch_name, 
  c.location_type, 
  c.status
FROM cameras c
JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN resource_nodes b ON c.branch_node_id = b.id
WHERE c.location_type IN ('vault', 'strong-room', 'locker-room')
   OR rn.name ILIKE '%vault%'
ORDER BY b.name, c.channel;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
