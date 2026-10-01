import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable'
});

async function main() {
  const agentId = '9f108498-4dd5-4a21-b810-eec9e538953c';
  const branchId = '921d336d-baa9-4b25-9f9f-f6542bba94cc';

  console.log('Querying credentials in database as discovery-bootstrap does...');
  const result = await pool.query(
    `SELECT ip_address, username, password, updated_at
     FROM camera_credentials
     WHERE branch_id = $1
       AND scope = 'host-specific'
       AND ip_address IS NOT NULL
     ORDER BY updated_at DESC`,
    [branchId]
  );
  console.log('Found credentials:', result.rows);
  await pool.end();
}

main().catch(console.error);
