const { Client } = require('pg');
const { randomUUID, randomBytes, createHash } = require('crypto');

const agentId = 'e9f439e5-e7f1-414f-9642-cb8c3eb3a3b3';
const camera6Id = '9b9c11b0-6d5a-40c6-a1c1-a0f31e4438bc';
const ipCamId = '6c819695-96ba-4fca-8ad7-3e66c84b25af';

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  for (const [name, camId] of [['Channel 6', camera6Id], ['IP Camera', ipCamId]]) {
    console.log(`\n--- Testing ${name} (${camId}) ---`);
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest();
    const expiresAt = new Date(Date.now() + 60_000);

    await client.query(
      `INSERT INTO live_sessions (id, camera_id, user_id, token_hash, expires_at, purpose, profile)
       VALUES ($1, $2::uuid, $3, $4, $5, $6, $7)`,
      [id, camId, '00000000-0000-4000-8000-000000000201', tokenHash, expiresAt, 'view', 'sub']
    );

    console.log(`Created live session token: ${token.slice(0, 10)}...`);

    // Now test calling edge live gateway via relay
    const relayUrl = `http://localhost:8080/v1/edge-media/${agentId}/v1/live/start`;
    console.log(`Posting to relay: ${relayUrl}`);

    try {
      const res = await fetch(relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ controlPlaneToken: token, profile: 'sub' })
      });
      console.log(`Response Status: ${res.status}`);
      const body = await res.json();
      console.log('Response Body:', JSON.stringify(body, null, 2));
    } catch (err) {
      console.error('Fetch error:', err.message);
    }
  }

  await client.end();
}

main().catch(console.error);
