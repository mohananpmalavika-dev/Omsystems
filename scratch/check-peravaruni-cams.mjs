import { execSync } from 'node:child_process';

const sql = `
SELECT id, channel, ip_address, connection_secret_ref, edge_agent_id, status 
FROM cameras 
WHERE branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61' 
ORDER BY channel;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
