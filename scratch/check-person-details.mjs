import { execSync } from 'child_process';

const sql = `
-- Check analytics_rules columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'analytics_rules'
ORDER BY ordinal_position;

-- Sample person rule
SELECT * FROM analytics_rules WHERE detection_type = 'person' LIMIT 1;

-- Check cameras missing person rule
SELECT c.id, c.channel, rn.name as camera_name, c.tenant_id
FROM cameras c
LEFT JOIN resource_nodes rn ON c.resource_node_id = rn.id
WHERE NOT EXISTS (
  SELECT 1 FROM analytics_rules r WHERE r.camera_id = c.id AND r.detection_type = 'person'
);
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
