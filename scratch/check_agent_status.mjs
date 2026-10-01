import { execSync } from 'child_process';

const sql = `SELECT id, name, status, last_seen_at, public_media_url, local_media_url FROM edge_agents;`;
const output = execSync(`gcloud compute ssh kryptovision-server --zone asia-south1-b --command "sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${sql}\\""`).toString();
console.log(output);

const camSql = `SELECT id, name, edge_agent_id FROM cameras LIMIT 10;`;
const camOutput = execSync(`gcloud compute ssh kryptovision-server --zone asia-south1-b --command "sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${camSql}\\""`).toString();
console.log(camOutput);
