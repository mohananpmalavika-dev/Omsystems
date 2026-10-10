import { execSync } from 'child_process';

const sql = `
\\d nbfc_analytics_rules
SELECT id, name, template_id, detector_type, enabled, state, camera_ids, branch_ids
FROM nbfc_analytics_rules
WHERE name ILIKE '%vault%' OR detector_type ILIKE '%vault%' OR template_id ILIKE '%vault%' OR description ILIKE '%vault%';

SELECT id, name, detector_type, description 
FROM nbfc_rule_templates
WHERE name ILIKE '%vault%' OR detector_type ILIKE '%vault%' OR description ILIKE '%vault%';
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
