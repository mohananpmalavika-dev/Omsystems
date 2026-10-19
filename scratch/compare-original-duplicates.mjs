import { execSync } from 'node:child_process';

const sql = `
WITH original AS (
  SELECT id, channel FROM cameras 
  WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' 
    AND id IN ('4d3caa3d-e03d-4689-81a6-a10e6f26329c', 'a66bbc0b-1d47-4462-9cf7-94b5b35824df', '940fb6f4-7c41-4c92-b4f1-85a459ebb38d', '1fa8cd44-c782-40a3-81f2-a933fb2b1d76', '9cf710ef-1a0b-444b-9c30-abbac95948fe', 'fc1a1f29-8b1c-4743-a093-40584e1a96a8', '3baa601f-67e0-4e0e-905d-0688df725bf1', '14d869da-4642-4d74-9de0-c4c6c2be4488')
),
duplicates AS (
  SELECT id, channel FROM cameras 
  WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' 
    AND id NOT IN ('4d3caa3d-e03d-4689-81a6-a10e6f26329c', 'a66bbc0b-1d47-4462-9cf7-94b5b35824df', '940fb6f4-7c41-4c92-b4f1-85a459ebb38d', '1fa8cd44-c782-40a3-81f2-a933fb2b1d76', '9cf710ef-1a0b-444b-9c30-abbac95948fe', 'fc1a1f29-8b1c-4743-a093-40584e1a96a8', '3baa601f-67e0-4e0e-905d-0688df725bf1', '14d869da-4642-4d74-9de0-c4c6c2be4488')
)
SELECT 
  'Original' as set_type,
  (SELECT count(*) FROM analytics_rules WHERE camera_id IN (SELECT id FROM original)) as rules,
  (SELECT count(*) FROM analytics_events WHERE camera_id IN (SELECT id FROM original)) as events,
  (SELECT count(*) FROM analytics_alerts WHERE camera_id IN (SELECT id FROM original)) as alerts,
  (SELECT count(*) FROM detected_objects WHERE camera_id IN (SELECT id FROM original)) as objects
UNION ALL
SELECT 
  'Duplicates' as set_type,
  (SELECT count(*) FROM analytics_rules WHERE camera_id IN (SELECT id FROM duplicates)) as rules,
  (SELECT count(*) FROM analytics_events WHERE camera_id IN (SELECT id FROM duplicates)) as events,
  (SELECT count(*) FROM analytics_alerts WHERE camera_id IN (SELECT id FROM duplicates)) as alerts,
  (SELECT count(*) FROM detected_objects WHERE camera_id IN (SELECT id FROM duplicates)) as objects;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
