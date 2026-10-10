import { execSync } from 'child_process';

const sql = `
SELECT detection_type, count(*), count(*) FILTER (WHERE enabled = true) as enabled_count
FROM analytics_rules
GROUP BY detection_type
ORDER BY count(*) DESC;

SELECT id, name, detection_type, camera_id, enabled, severity
FROM analytics_rules
WHERE name ILIKE '%vault%' OR detection_type ILIKE '%vault%' OR detection_type ILIKE '%dual%' OR detection_type ILIKE '%occupan%'
LIMIT 20;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
