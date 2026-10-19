import { execSync } from 'node:child_process';

const query = "SELECT id, channel, vendor, recorder_id, ip_address, connection_secret_ref, edge_agent_id FROM cameras WHERE branch_node_id = '525198ad-504d-48af-ac6c-dca057d38ed5' ORDER BY channel;";
const b64 = Buffer.from(query).toString('base64');
const out = execSync(
  `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
  { encoding: 'utf8' }
);
console.log(out);
