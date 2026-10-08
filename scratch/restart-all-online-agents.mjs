import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const runnerCode = `
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable'
});

async function main() {
  const requestedBy = '00000000-0000-4000-8000-000000000201';

  // Find all edge agents seen in the last 15 minutes
  const activeAgents = await pool.query(
    "SELECT id, name, last_seen_at FROM edge_agents WHERE last_seen_at > now() - interval '15 minutes' AND credential_revoked_at IS NULL"
  );

  console.log('Active edge agents to restart:', activeAgents.rows.length);
  for (const agent of activeAgents.rows) {
    console.log(\`  Queueing restart for \${agent.name} (\${agent.id})...\`);
    const res = await pool.query(
      \`INSERT INTO edge_commands
         (tenant_id, branch_node_id, edge_agent_id, command_type, payload, requested_by)
       SELECT tenant_id, branch_node_id, id, 'restart-agent', '{}'::jsonb, $2
       FROM edge_agents WHERE id = $1
       RETURNING id\`,
      [agent.id, requestedBy]
    );
    console.log(\`    Command ID: \${res.rows[0]?.id}\`);
  }

  console.log('\\nWaiting 15 seconds for agents to acknowledge and restart...');
  await new Promise(r => setTimeout(r, 15000));

  const status = await pool.query(
    "SELECT edge_agent_id, command_type, status, error, requested_at, completed_at FROM edge_commands WHERE requested_at > now() - interval '1 minute' ORDER BY requested_at DESC"
  );
  console.log('\\nRecent command status:');
  for (const row of status.rows) {
    console.log(\`  Agent \${row.edge_agent_id}: \${row.command_type} -> \${row.status} (completed: \${row.completed_at})\`);
  }

  await pool.end();
}

main().catch(console.error);
`;

const innerB64 = Buffer.from(runnerCode).toString('base64');
const cmd = 'echo ' + innerB64 + ' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module';
const command = 'echo ' + gzipSync(Buffer.from(cmd)).toString('base64') + ' | base64 -d | gzip -d | bash';

const r = spawnSync('gcloud.cmd', [
  'compute', 'ssh', 'kryptovision-server',
  '--zone=asia-south1-b',
  '--project=project-7866fc3f-5dd5-4495-804',
  '--quiet',
  '--command=' + JSON.stringify(command)
], { shell: true, encoding: 'utf8', timeout: 60000 });

console.log(r.stdout || r.stderr);
