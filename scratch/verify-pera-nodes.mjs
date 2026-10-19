import { execSync } from 'child_process';

const sql = `
SELECT 
  rn.id, 
  rn.name, 
  rn.node_type, 
  rn.is_active,
  c.id as camera_id,
  c.channel,
  c.ip_address,
  c.status
FROM resource_nodes rn
LEFT JOIN cameras c ON c.resource_node_id = rn.id
WHERE rn.parent_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' AND rn.is_active = true
ORDER BY c.channel;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
