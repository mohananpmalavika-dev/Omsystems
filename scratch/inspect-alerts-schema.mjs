import { execSync } from 'child_process';

const sql = `
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'analytics_alerts';
SELECT count(*) FROM analytics_alerts WHERE rule_id IN (SELECT id FROM analytics_rules WHERE detection_type = 'dual-control-verification');
SELECT count(*) FROM analytics_alerts WHERE event_id IN (SELECT id FROM analytics_events WHERE detection_type = 'dual-control-verification' OR source_event_id LIKE 'branch-opening%');
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
