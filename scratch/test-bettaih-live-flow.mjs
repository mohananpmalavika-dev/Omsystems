import { execSync } from 'child_process';

const code = `
const { randomBytes, createHash } = require('crypto');
const pg = require('pg');

async function test() {
  const pool = new pg.Pool({ connectionString: 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable' });
  
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

  console.log('Testing /api/live for Bettaih Channel 1 (2e12f799-5135-4127-ab71-5fa2980ccb0f)...');

  const res = await fetch('http://sentinel-gcp-dashboard:10000/api/live', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cookie': 'sentinel_access=' + token,
      'authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      cameraId: '2e12f799-5135-4127-ab71-5fa2980ccb0f',
      profile: 'sub'
    })
  });

  console.log('Status:', res.status);
  console.log('Response:', await res.json());

  await pool.end();
}
test().catch(console.error);
`;

const base64 = Buffer.from(code).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
