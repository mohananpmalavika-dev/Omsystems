import { randomUUID, randomBytes, createHash } from 'crypto';
import { execSync } from 'child_process';

const ch1CameraId = '0fc5c021-4246-4659-87a0-0ba4c6f36240'; // Rajkot - Channel 1
const userId = '043561dc-a162-48ca-b7e4-290a9c4ad1ff';
const agentId = '9f108498-4dd5-4a21-b810-eec9e538953c';
const relayBase = `https://34-14-220-41.sslip.io/v1/edge-media/${agentId}`;
const profile = 'sub';

async function main() {
  const sessionId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = '\\x' + createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 600_000).toISOString();

  const sql = `INSERT INTO live_sessions (id, camera_id, user_id, token_hash, expires_at, purpose, profile) VALUES ('${sessionId}', '${ch1CameraId}', '${userId}', '${tokenHash}', '${expiresAt}', 'view', '${profile}');`;
  const base64 = Buffer.from(sql).toString('base64');
  const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
  console.log('1. Inserting live session token in GCP database...');
  execSync(cmd, { stdio: 'inherit' });

  console.log('2. Requesting /v1/live/start on edge media relay...');
  const startRes = await fetch(`${relayBase}/v1/live/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ controlPlaneToken: token, profile })
  });

  const session = await startRes.json();
  console.log('Relay response status:', startRes.status);
  console.log('Relay session data:', session);
}

main().catch(console.error);
