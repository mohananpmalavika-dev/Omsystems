import { execSync } from 'node:child_process';

const sql = `
SELECT c.channel, c.status, c.ip_address, c.recorder_id, c.connection_secret_ref, c.edge_agent_id
FROM cameras c
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61'
ORDER BY c.channel;

SELECT branch_id, ip_address, username, scope, edge_agent_id
FROM camera_credentials
WHERE branch_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61';

SELECT edge_agent_id, branch_node_id, vpn_networks
FROM edge_agent_branch_assignments
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61';
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
