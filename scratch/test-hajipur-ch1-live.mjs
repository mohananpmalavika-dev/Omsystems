import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const agentId = '9f108498-4dd5-4a21-b810-eec9e538953c';
const userId = '00000000-0000-4000-8000-000000000201'; // user-global-admin
const relayBase = `https://34-14-220-41.sslip.io/v1/edge-media/${agentId}`;

// 1. Create a session in DB for fa0a7e3d-6f72-4261-a688-d64dd05efc37
const camId = 'fa0a7e3d-6f72-4261-a688-d64dd05efc37';
const sessionId = randomUUID();
const token = randomBytes(32).toString('base64url');
const tokenHash = '\\x' + createHash('sha256').update(token).digest('hex');
const expiresAt = new Date(Date.now() + 600_000).toISOString();

const insertSql = `INSERT INTO live_sessions (id, camera_id, user_id, token_hash, expires_at, purpose, profile) VALUES ('${sessionId}', '${camId}', '${userId}', '${tokenHash}', '${expiresAt}', 'view', 'sub');`;
const base64 = Buffer.from(insertSql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log('Inserting test live session in remote DB...');
execSync(cmd, { encoding: 'utf8' });

console.log('Testing live start on relay for Hajipur Channel 1...');
try {
  const res = await fetch(`${relayBase}/v1/live/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ controlPlaneToken: token, profile: 'sub' })
  });
  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', data);
} catch (e) {
  console.error('Fetch error:', e);
}
