import { execSync } from 'child_process';

const sql = `
SELECT id, branch_node_id, ip_address, channel, recorder_channel, model, vendor, status, connection_secret_ref, edge_agent_id FROM cameras ORDER BY branch_node_id, channel;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
