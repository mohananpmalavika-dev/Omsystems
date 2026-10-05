import { execSync } from 'child_process';

const sql = `
SELECT DISTINCT detector_type, enabled, state, count(*) 
FROM nbfc_analytics_rules 
GROUP BY detector_type, enabled, state;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
