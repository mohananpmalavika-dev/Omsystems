import { execSync } from 'child_process';

function runSql(sql) {
  const cleanSql = sql.replace(/"/g, '\\"');
  const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${cleanSql}\\""`;
  return execSync(cmd, { encoding: 'utf8' });
}

console.log('=== QUEUEING COLLECT-LOGS COMMAND ===');
const edgeAgentId = '9f108498-4dd5-4a21-b810-eec9e538953c';
const requestedBy = '00000000-0000-4000-8000-000000000201';
console.log(runSql(`INSERT INTO edge_commands (tenant_id, branch_node_id, edge_agent_id, command_type, payload, requested_by) SELECT tenant_id, branch_node_id, id, 'collect-logs', '{}'::jsonb, '${requestedBy}' FROM edge_agents WHERE id = '${edgeAgentId}' RETURNING id, status;`));
