import pg from 'pg';
import { CameraRepository } from '/app/dist/src/database/camera-repository.js';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable'
});

async function main() {
  const repo = new CameraRepository(pool, null);
  const cams = await repo.listByEdgeAgent('9f108498-4dd5-4a21-b810-eec9e538953c');
  console.log(`Found ${cams.length} cameras mapped by CameraRepository:`);
  for (const c of cams) {
    console.log(`Ch ${c.recorderChannel}: id=${c.id}, ipAddress="${c.ipAddress}", secretRef=${c.connectionSecretRef}`);
  }
  await pool.end();
}

main().catch(console.error);
