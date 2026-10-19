import { execSync } from 'node:child_process';

const sql = `
SELECT 
  c.id,
  c.channel,
  c.edge_agent_id,
  c.connection_secret_ref,
  css.reference as secret_reference,
  css.edge_agent_id as secret_edge_agent_id
FROM cameras c
LEFT JOIN central_stream_secrets css ON c.connection_secret_ref = css.reference
WHERE c.branch_node_id = 'd8467a57-dae8-4012-ba5e-c3254075aa61'
ORDER BY c.channel;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
