import { randomUUID, randomBytes, createHash } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable'
});

const CAMERA_ID = 'e79fe538-f8db-45c6-949e-d64849a81aee';
const TUNNEL_URL = 'https://nottingham-approved-logging-roberts.trycloudflare.com';

async function run() {
  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest();
  const expiresAt = new Date(Date.now() + 120_000);

  console.log('1. Inserting live session token into DB...');
  await pool.query(
    `INSERT INTO live_sessions (id, camera_id, user_id, token_hash, expires_at, purpose)
     VALUES ($1, $2::uuid, $3, $4, $5, $6)`,
    [id, CAMERA_ID, 'test-diagnostic-user', tokenHash, expiresAt, 'view']
  );
  console.log('Session inserted:', { id, token: token.slice(0, 10) + '...' });

  console.log('2. Calling Edge Agent /v1/live/start directly at tunnel URL...');
  try {
    const res = await fetch(`${TUNNEL_URL}/v1/live/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ controlPlaneToken: token }),
    });
    console.log('Status:', res.status, res.statusText);
    const body = await res.text();
    console.log('Body:', body);
  } catch (err) {
    console.error('Fetch error:', err);
  } finally {
    await pool.end();
  }
}

run();
