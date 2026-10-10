import { execSync } from 'child_process';

const sql = `
SELECT 
  c.id as camera_id,
  c.channel,
  rn.name as camera_name,
  rn.tenant_id,
  rp.enabled as person_enabled,
  rh.enabled as helmet_enabled
FROM cameras c
LEFT JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN analytics_rules rp ON rp.camera_id = c.id AND rp.detection_type = 'person'
LEFT JOIN analytics_rules rh ON rh.camera_id = c.id AND rh.detection_type = 'helmet-worn'
ORDER BY c.channel, rn.name;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
