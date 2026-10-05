import { execSync } from 'child_process';

const sql = `
SELECT DISTINCT title, detection_signature->>'detectionType' as det_type, count(*) 
FROM analytics_alerts 
GROUP BY title, det_type 
ORDER BY count(*) DESC;

SELECT DISTINCT detection_type, count(*), array_agg(DISTINCT enabled) as enabled_states
FROM analytics_rules 
GROUP BY detection_type;

SELECT DISTINCT detection_type, suppressed, label 
FROM alert_suppression_config;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
