import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable'
});

async function main() {
  const res = await pool.query(
    `SELECT result->>'tail' as tail 
     FROM edge_commands 
     WHERE command_type = 'collect-logs' AND status = 'succeeded' 
     ORDER BY requested_at DESC LIMIT 1`
  );
  if (!res.rows[0]?.tail) {
    console.log('No log tail found');
    await pool.end();
    return;
  }
  const lines = res.rows[0].tail.split('\n');
  console.log(`Total lines: ${lines.length}`);
  const filtered = lines.filter(l => /recover|secret|probe|candidat|realmonitor|172\.29\.91\.100/i.test(l));
  console.log('--- MATCHING LINES ---');
  for (const line of filtered) {
    console.log(line);
  }
  await pool.end();
}

main().catch(console.error);
