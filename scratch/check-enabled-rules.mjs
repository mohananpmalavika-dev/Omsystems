import { execSync } from 'child_process';

const sql = `
SELECT detection_type, count(*), count(*) FILTER (WHERE enabled = true) as enabled_count
FROM analytics_rules
GROUP BY detection_type
ORDER BY enabled_count DESC;

SELECT detector_type, count(*), count(*) FILTER (WHERE enabled = true) as enabled_count
FROM nbfc_analytics_rules
GROUP BY detector_type
ORDER BY enabled_count DESC;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
