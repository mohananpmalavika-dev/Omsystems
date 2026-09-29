import { randomUUID, randomBytes, createHash } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable'
});

async function test() {
  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest();
  const expiresAt = new Date(Date.now() + 120_000);

  const userRes = await pool.query('SELECT id FROM users LIMIT 1');
  const userId = userRes.rows[0].id;

  await pool.query(
    'INSERT INTO live_sessions (id, camera_id, user_id, token_hash, expires_at, purpose, profile) VALUES ($1, $2::uuid, $3, $4, $5, $6, $7)',
    [id, 'dbade029-e217-4b5d-bdeb-eb0351857136', userId, tokenHash, expiresAt, 'view', 'main']
  );

  console.log('Created live session:', id);

  const res = await fetch('http://127.0.0.1:8080/v1/edge-media/26cbf33d-9fdd-4446-9df0-9cae1680a6f9/v1/live/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ controlPlaneToken: token, profile: 'main' })
  });

  console.log('STATUS:', res.status);
  const text = await res.text();
  console.log('RESPONSE:', text);
  await pool.end();
}

test().catch(console.error);
