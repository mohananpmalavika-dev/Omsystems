import { execSync } from 'child_process';

const sql = `SELECT * FROM operational_health_telemetry WHERE edge_agent_id = '1248fd81-283e-4fca-88f4-adee7ad5b3e9' ORDER BY timestamp DESC LIMIT 3;`;
const output = execSync(
  `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${sql}\\""`
);
console.log(output.toString());
