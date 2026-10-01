import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable'
});

async function main() {
  const edgeAgentId = '9f108498-4dd5-4a21-b810-eec9e538953c';
  const requestedBy = '00000000-0000-4000-8000-000000000201';

  console.log('Sending restart-agent command to Hajipur edge agent...');
  const res = await pool.query(
    `INSERT INTO edge_commands
       (tenant_id, branch_node_id, edge_agent_id, command_type, payload, requested_by)
     SELECT tenant_id, branch_node_id, id, 'restart-agent', '{}'::jsonb, $2
     FROM edge_agents WHERE id = $1 AND credential_revoked_at IS NULL
     RETURNING id, command_type, status, requested_at`,
    [edgeAgentId, requestedBy]
  );
  const cmd = res.rows[0];
  console.log('Created command:', cmd);

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const check = await pool.query('SELECT status, result, error FROM edge_commands WHERE id = $1', [cmd.id]);
    const row = check.rows[0];
    if (row.status === 'succeeded') {
      console.log('✅ restart-agent command SUCCEEDED! Agent acknowledged and restarted.');
      console.log('Result:', row.result);
      break;
    } else if (row.status === 'failed') {
      console.error('❌ Command failed:', row.error);
      break;
    } else {
      process.stdout.write('.');
    }
  }

  await pool.end();
}

main().catch(console.error);
