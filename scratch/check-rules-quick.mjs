import { execSync } from 'child_process';

const sql = `
SELECT c.id, c.recorder_channel, c.model, r.id as rule_id, r.name as rule_name, r.detection_type, r.enabled
FROM cameras c
LEFT JOIN analytics_rules r ON r.camera_id = c.id
WHERE r.detection_type = 'helmet-worn' OR c.model ILIKE '%CP PLUS%'
ORDER BY c.recorder_channel, r.detection_type;

SELECT count(*) as total_cameras FROM cameras;
SELECT count(*) as total_helmet_rules_enabled FROM analytics_rules WHERE detection_type = 'helmet-worn' AND enabled = true;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
