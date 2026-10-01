import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable'
});

async function main() {
  const agentId = '9f108498-4dd5-4a21-b810-eec9e538953c';
  const branchId = '921d336d-baa9-4b25-9f9f-f6542bba94cc';

  console.log('=== CAMERAS ===');
  const cams = await pool.query(
    `SELECT id, name, ip_address, recorder_channel, connection_secret_ref, status 
     FROM cameras WHERE branch_node_id = $1 ORDER BY recorder_channel ASC`,
    [branchId]
  );
  console.table(cams.rows);

  console.log('=== CAMERA DISCOVERIES ===');
  const disc = await pool.query(
    `SELECT id, display_name, ip_address, discovery_method, recorder_channel, stream_verified, status_reason, created_at 
     FROM camera_discoveries WHERE ip_address = '172.29.91.100' ORDER BY created_at DESC`
  );
  console.table(disc.rows);

  console.log('=== CAMERA CREDENTIALS ===');
  const creds = await pool.query(
    `SELECT id, branch_id, ip_address, username, updated_at FROM camera_credentials WHERE ip_address = '172.29.91.100'`
  );
  console.table(creds.rows);

  console.log('=== RECENT EDGE SCAN JOBS ===');
  const jobs = await pool.query(
    `SELECT id, status, scope, target_ip, result_count, error, created_at, completed_at 
     FROM edge_scan_jobs WHERE edge_agent_id = $1 ORDER BY created_at DESC LIMIT 5`,
    [agentId]
  );
  console.table(jobs.rows);

  console.log('=== RECENT EDGE COMMANDS ===');
  const cmds = await pool.query(
    `SELECT id, command_type, status, error, requested_at, completed_at 
     FROM edge_commands WHERE edge_agent_id = $1 ORDER BY requested_at DESC LIMIT 5`,
    [agentId]
  );
  console.table(cmds.rows);

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
