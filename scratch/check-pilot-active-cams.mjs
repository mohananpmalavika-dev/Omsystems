import { execSync } from 'child_process';

const sql = `
SELECT 
  c.id, c.channel, c.recorder_channel, c.status, c.last_seen_at,
  rn.name as rn_name,
  ar.id as rule_id, ar.detection_type, ar.enabled as rule_enabled,
  ar.min_confidence, ar.severity
FROM cameras c
JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN analytics_rules ar ON ar.camera_id = c.id
WHERE c.branch_node_id = '00000000-0000-4000-8000-000000000104'
  AND rn.is_active = true
ORDER BY c.channel, rn.name;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
