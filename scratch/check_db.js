import { execSync } from 'child_process';

const sql = `SELECT detection_type, status, confidence, rejection_reason, occurred_at FROM analytics_events WHERE detection_type LIKE '%helmet%' ORDER BY occurred_at DESC LIMIT 10;`;
const output = execSync(
  `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${sql}\\""`
);
console.log(output.toString());
