import { execSync } from 'child_process';

const sql = `
SELECT branch_node_id, primary_transport, fallback_transport, vpn_protocol, vpn_remote_networks, status 
FROM branch_connectivity_profiles LIMIT 10;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
