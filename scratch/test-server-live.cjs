const { randomBytes, createHash } = require('node:crypto');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const token = randomBytes(64).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('base64');
  const refresh = randomBytes(64).toString('base64url');
  const refreshHash = createHash('sha256').update(refresh).digest('base64');
  const user = (await pool.query("SELECT id, tenant_id FROM users WHERE username = 'mgdhanyamohan'")).rows[0];
  const sessionId = randomBytes(16).toString('hex');
  await pool.query(
    'INSERT INTO user_sessions (id, user_id, tenant_id, access_token_hash, refresh_token_hash, access_expires_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [sessionId, user.id, user.tenant_id, tokenHash, refreshHash, new Date(Date.now() + 3600000), new Date(Date.now() + 86400000)]
  );

  const camerasRes = await pool.query(
    `SELECT c.id, rn.name FROM cameras c 
     JOIN resource_nodes rn ON c.resource_node_id = rn.id 
     WHERE c.branch_node_id = '00000000-0000-4000-8000-000000000104' AND rn.name LIKE 'CP PLUS DVR - Channel %' 
     ORDER BY rn.name`
  );

  console.log(`Testing /api/live for ${camerasRes.rows.length} channels...`);

  for (const cam of camerasRes.rows) {
    const res = await fetch('http://dashboard:10000/api/live', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cookie': 'sentinel_access=' + token,
        'authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ cameraId: cam.id, profile: 'sub', routePreference: 'public' })
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      console.log(`✅ [${cam.name}] Status: ${res.status} | HLS: ${data.hls?.url ? 'YES' : 'NO'} | WebRTC: ${data.webRtc?.whepUrl ? 'YES' : 'NO'}`);
    } else {
      console.log(`❌ [${cam.name}] Status: ${res.status} | Error:`, data);
    }
  }

  await pool.end();
}

run().catch(console.error);
