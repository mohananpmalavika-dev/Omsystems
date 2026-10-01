import { createPostgresStore } from '/app/dist/src/database/postgres-store.js';

async function main() {
  const store = createPostgresStore({
    connectionString: process.env.DATABASE_URL || 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable'
  });
  const cams = await store.listCamerasByEdgeAgent('9f108498-4dd5-4a21-b810-eec9e538953c');
  console.log('Returned cameras from store:');
  for (const c of cams) {
    console.log(`Ch ${c.recorderChannel}: id=${c.id}, ipAddress="${c.ipAddress}", secretRef=${c.connectionSecretRef}`);
  }
  process.exit(0);
}

main().catch(console.error);
