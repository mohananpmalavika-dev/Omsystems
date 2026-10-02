import { execSync } from 'child_process';

const sql = `SELECT json_agg(t) FROM (SELECT detection_type, confidence, occurred_at, (metadata - 'snapshotBase64') as meta FROM analytics_events WHERE camera_id='9b9c11b0-6d5a-40c6-a1c1-a0f31e4438bc' ORDER BY occurred_at DESC LIMIT 5) t;`;
const output = execSync(
  `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${sql}\\""`
);
console.log(output.toString());
