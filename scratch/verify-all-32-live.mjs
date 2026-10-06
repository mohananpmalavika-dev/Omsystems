import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const agentId = '9f108498-4dd5-4a21-b810-eec9e538953c';
const userId = '00000000-0000-4000-8000-000000000201'; // user-global-admin
const relayBase = `https://34-14-220-41.sslip.io/v1/edge-media/${agentId}`;

// 1. Fetch all 32 cameras
const fetchSql = `
SELECT 
  c.id, 
  b.name as branch_name,
  c.recorder_channel, 
  c.status, 
  c.connection_secret_ref 
FROM cameras c 
JOIN branches b ON b.id = c.branch_node_id
ORDER BY b.name ASC, c.recorder_channel ASC;
`;
const base64 = Buffer.from(fetchSql).toString('base64');
const cmd = `ssh -i C:\\Users\\Dhanya\\.ssh\\google_compute_engine -o StrictHostKeyChecking=no Dhanya@34.14.220.41 "echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t -A -F'|'"`;

const output = execSync(cmd, { encoding: 'utf8' }).trim();
const lines = output.split('\n').filter(Boolean);
console.log(`Found ${lines.length} cameras across all branches.`);

const tokens = [];
const sessionValues = [];
const expiresAt = new Date(Date.now() + 600_000).toISOString();

for (const line of lines) {
  const [camId, branch, channel, status, ref] = line.split('|');
  const sessionId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = '\\x' + createHash('sha256').update(token).digest('hex');
  tokens.push({ camId, branch, channel: parseInt(channel, 10), token, status, ref });
  sessionValues.push(`('${sessionId}', '${camId}', '${userId}', '${tokenHash}', '${expiresAt}', 'view', 'sub')`);
}

import fs from 'node:fs';

const insertSessionsSql = `INSERT INTO live_sessions (id, camera_id, user_id, token_hash, expires_at, purpose, profile) VALUES ${sessionValues.join(',\n')};`;
const tempFile = 'scratch/insert-live-sessions.sql';
fs.writeFileSync(tempFile, insertSessionsSql, 'utf8');
execSync(`scp -i C:\\Users\\Dhanya\\.ssh\\google_compute_engine -o StrictHostKeyChecking=no ${tempFile} Dhanya@34.14.220.41:/tmp/insert-live-sessions.sql`, { stdio: 'inherit' });
execSync(`ssh -i C:\\Users\\Dhanya\\.ssh\\google_compute_engine -o StrictHostKeyChecking=no Dhanya@34.14.220.41 "sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid < /tmp/insert-live-sessions.sql"`, { stdio: 'inherit' });
console.log(`Created live session tokens for all ${tokens.length} cameras in sentinel_grid database.\n`);

console.log('--- TESTING LIVE VIEW START VIA EDGE RELAY FOR ALL CAMERAS ---');
const results = [];

for (const info of tokens) {
  try {
    const res = await fetch(`${relayBase}/v1/live/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ controlPlaneToken: info.token, profile: 'sub' })
    });
    const data = await res.json();
    if (res.status === 201 || res.status === 200) {
      console.log(`✅ [${info.branch}] Ch ${info.channel}: LIVE OK (${res.status}) -> ${data.hls?.url || 'ready'}`);
      results.push({ branch: info.branch, channel: info.channel, ok: true, url: data.hls?.url });
    } else {
      console.log(`❌ [${info.branch}] Ch ${info.channel}: FAILED (${res.status}) ->`, data);
      results.push({ branch: info.branch, channel: info.channel, ok: false, error: data });
    }
  } catch (e) {
    console.error(`❌ [${info.branch}] Ch ${info.channel} Error:`, e.message);
    results.push({ branch: info.branch, channel: info.channel, ok: false, error: e.message });
  }
}

const totalOk = results.filter(r => r.ok).length;
console.log(`\n========================================`);
console.log(`Live View Verification Summary: ${totalOk} / ${results.length} working`);
console.log(`========================================`);
