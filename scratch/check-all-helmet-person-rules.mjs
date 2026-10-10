import { execSync } from 'child_process';

const sql = `
SELECT detection_type, name, enabled, count(*)
FROM analytics_rules
WHERE detection_type ILIKE '%helmet%' OR detection_type ILIKE '%person%' OR name ILIKE '%helmet%' OR name ILIKE '%person%'
GROUP BY detection_type, name, enabled
ORDER BY detection_type, enabled;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
