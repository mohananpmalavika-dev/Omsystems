import { randomUUID, randomBytes, createHash } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable'
});

const branchId = '921d336d-baa9-4b25-9f9f-f6542bba94cc';
const agentId = '9f108498-4dd5-4a21-b810-eec9e538953c';
const userId = '00000000-0000-4000-8000-000000000201'; // user-global-admin
const relayBase = `https://34-14-220-41.sslip.io/v1/edge-media/${agentId}`;

async function main() {
  console.log('Fetching all 8 Hajipur cameras...');
  const camsRes = await pool.query(
    `SELECT id, recorder_channel, model, connection_secret_ref 
     FROM cameras 
     WHERE branch_node_id = $1 AND ip_address = '172.29.91.100'
     ORDER BY recorder_channel ASC`,
    [branchId]
  );

  const cameras = camsRes.rows;
  console.log(`Found ${cameras.length} cameras for Hajipur DVR.`);

  const tokens = {};
  const values = [];
  const expiresAt = new Date(Date.now() + 600_000).toISOString();

  for (const cam of cameras) {
    const sessionId = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const tokenHash = '\\x' + createHash('sha256').update(token).digest('hex');
    tokens[cam.id] = token;
    values.push(`('${sessionId}', '${cam.id}', '${userId}', '${tokenHash}', '${expiresAt}', 'view', 'sub')`);
  }

  const sql = `INSERT INTO live_sessions (id, camera_id, user_id, token_hash, expires_at, purpose, profile) VALUES ${values.join(', ')};`;
  await pool.query(sql);
  console.log('Inserted live sessions for all 8 cameras in database.');

  console.log('\n--- TESTING LIVE START ON HAJIPUR EDGE RELAY ---');
  for (const cam of cameras) {
    const token = tokens[cam.id];
    console.log(`\nTesting Channel ${cam.recorder_channel} (ID: ${cam.id})...`);
    try {
      const res = await fetch(`${relayBase}/v1/live/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ controlPlaneToken: token, profile: 'sub' })
      });
      const data = await res.json();
      if (res.status === 201) {
        console.log(`✅ Channel ${cam.recorder_channel}: LIVE START SUCCESS (201)! HLS: ${data.hls?.url}`);
      } else {
        console.log(`❌ Channel ${cam.recorder_channel}: FAILED (${res.status}):`, data);
      }
    } catch (e) {
      console.error(`❌ Channel ${cam.recorder_channel} Error:`, e.message);
    }
  }

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
