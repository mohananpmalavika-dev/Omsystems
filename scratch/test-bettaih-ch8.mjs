import { randomBytes, createHash } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid' });

async function main() {
  const token = randomBytes(64).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('base64');
  const refresh = randomBytes(64).toString('base64url');
  const refreshHash = createHash('sha256').update(refresh).digest('base64');

  const userRes = await pool.query("SELECT id, tenant_id FROM users WHERE username = 'mgdhanyamohan'");
  const user = userRes.rows[0];

  const sessionId = randomBytes(16).toString('hex');
  const accessExpiresAt = new Date(Date.now() + 3600000);
  const refreshExpiresAt = new Date(Date.now() + 86400000);

  await pool.query(
    'INSERT INTO user_sessions (id, user_id, tenant_id, access_token_hash, refresh_token_hash, access_expires_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [sessionId, user.id, user.tenant_id, tokenHash, refreshHash, accessExpiresAt, refreshExpiresAt]
  );

  console.log('Testing /api/live for Bettaih Channel 8 (b14a276f-63bd-4072-bb55-6978a6a8e93b)...');

  const res = await fetch('http://dashboard:10000/api/live', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cookie': `sentinel_access=${token}`,
      'authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      cameraId: 'b14a276f-63bd-4072-bb55-6978a6a8e93b',
      profile: 'sub'
    })
  });

  console.log('STATUS:', res.status);
  const body = await res.text();
  console.log('RESPONSE:', body);
  await pool.end();
}

main().catch(console.error);
