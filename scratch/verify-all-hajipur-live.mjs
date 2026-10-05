import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const agentId = '9f108498-4dd5-4a21-b810-eec9e538953c';
const userId = '00000000-0000-4000-8000-000000000201'; // user-global-admin
const relayBase = `https://34-14-220-41.sslip.io/v1/edge-media/${agentId}`;

// 1. Fetch all Hajipur cameras
const fetchSql = `
SELECT c.id, c.recorder_channel, rn.name, c.status, c.connection_secret_ref 
FROM cameras c 
JOIN resource_nodes rn ON rn.id = c.resource_node_id 
WHERE c.branch_node_id = '921d336d-baa9-4b25-9f9f-f6542bba94cc' AND c.ip_address = '172.29.91.100'
ORDER BY c.recorder_channel ASC NULLS LAST;
`;
const base64 = Buffer.from(fetchSql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t -A -F'|'"`;

const output = execSync(cmd, { encoding: 'utf8' }).trim();
const lines = output.split('\n').filter(Boolean);
console.log(`Found ${lines.length} cameras for Hajipur DVR.`);

const tokens = {};
const sessionValues = [];
const expiresAt = new Date(Date.now() + 600_000).toISOString();

for (const line of lines) {
  const [camId, channel, name, status, ref] = line.split('|');
  const sessionId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = '\\x' + createHash('sha256').update(token).digest('hex');
  tokens[camId] = { token, channel, name };
  sessionValues.push(`('${sessionId}', '${camId}', '${userId}', '${tokenHash}', '${expiresAt}', 'view', 'sub')`);
}

const insertSessionsSql = `INSERT INTO live_sessions (id, camera_id, user_id, token_hash, expires_at, purpose, profile) VALUES ${sessionValues.join(', ')};`;
const insertBase64 = Buffer.from(insertSessionsSql).toString('base64');
const insertCmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --command="echo '${insertBase64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
execSync(insertCmd, { encoding: 'utf8' });
console.log('Inserted live sessions for all cameras in database.\n');

console.log('--- TESTING LIVE STREAM START ON HAJIPUR EDGE RELAY ---');
for (const [camId, info] of Object.entries(tokens)) {
  try {
    const res = await fetch(`${relayBase}/v1/live/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ controlPlaneToken: info.token, profile: 'sub' })
    });
    const data = await res.json();
    if (res.status === 201) {
      console.log(`✅ Channel ${info.channel} (${info.name}): LIVE STREAM SUCCESS (201)! HLS: ${data.hls?.url}`);
    } else {
      console.log(`❌ Channel ${info.channel} (${info.name}): FAILED (${res.status}):`, data);
    }
  } catch (e) {
    console.error(`❌ Channel ${info.channel} (${info.name}) Error:`, e.message);
  }
}
