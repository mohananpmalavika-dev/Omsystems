import { execSync } from 'child_process';

const sql = `SELECT id, status, severity, false_alarm_reason, resolved_at FROM analytics_alerts WHERE id IN ('a51c4ed1-4110-4e7f-87f4-0132ddb53da7', '6d6bd5ba-4ba6-4f02-bf51-bb9a8edb89fb', 'a5245f6a-f659-49e7-992e-f8019658bcda');`;
const b64 = Buffer.from(`sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c "${sql}"`).toString('base64');
const out = execSync(`gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | bash"`);
console.log(out.toString());
