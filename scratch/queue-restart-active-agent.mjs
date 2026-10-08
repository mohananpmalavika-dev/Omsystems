import { execSync } from 'child_process';

const sql = `INSERT INTO edge_commands (tenant_id, branch_node_id, edge_agent_id, command_type, payload, requested_by) VALUES ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000104', 'b950f232-557e-42cd-8bc8-8f4490d0b68b', 'restart-agent', '{}', '00000000-0000-4000-8000-000000000201');`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
