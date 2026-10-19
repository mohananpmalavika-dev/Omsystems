import { createCipheriv, randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const STREAM_VAULT_KEY = 'eqNsNVnJvPqhSqTktB2W2Jmjd22ycKaOj0cWL6Y+92U=';
const key = Buffer.from(STREAM_VAULT_KEY, 'base64');

function encryptSecret(reference, sourceUri) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(reference));
  const ciphertext = Buffer.concat([cipher.update(sourceUri, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

const agent6dd = '6dd10cd4-5625-48f4-8431-23776bbd0795';
const baseRef = `edge://${agent6dd}/peravaruni-ch2`;
const subRef = `edge://${agent6dd}/peravaruni-ch2#sub`;
const mainRef = `edge://${agent6dd}/peravaruni-ch2#main`;

const subUri = 'rtsp://test:test%40123@172.29.55.100/cam/realmonitor?channel=2&subtype=1';
const mainUri = 'rtsp://test:test%40123@172.29.55.100/cam/realmonitor?channel=2&subtype=0';

const encBase = encryptSecret(baseRef, subUri);
const encSub = encryptSecret(subRef, subUri);
const encMain = encryptSecret(mainRef, mainUri);

const sql = `
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES 
  ('${baseRef}', '${agent6dd}', '${encBase}', now()),
  ('${subRef}', '${agent6dd}', '${encSub}', now()),
  ('${mainRef}', '${agent6dd}', '${encMain}', now())
ON CONFLICT (reference) DO UPDATE 
SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras 
SET edge_agent_id = '${agent6dd}',
    connection_secret_ref = '${baseRef}',
    ip_address = '172.29.55.100',
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    recorder_channel = 2
WHERE id = 'a66bbc0b-1d47-4462-9cf7-94b5b35824df';
`;

fs.writeFileSync('scratch/update-55-test.sql', sql, 'utf8');
execSync(`gcloud compute scp scratch/update-55-test.sql kryptovision-server:/tmp/update-55-test.sql --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet`);
execSync(`gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid < /tmp/update-55-test.sql"`);

console.log('Testing live session for 172.29.55.100 on 6dd10cd4...');
const loginRes = await fetch('https://35-200-130-81.sslip.io/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'test', password: 'test@123' })
});
const { accessToken } = await loginRes.json();

const sessionRes = await fetch('https://35-200-130-81.sslip.io/v1/cameras/a66bbc0b-1d47-4462-9cf7-94b5b35824df/live-sessions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`
  },
  body: '{}'
});
const sessionData = await sessionRes.json();
console.log('Session response:', sessionData);

if (sessionData.token) {
  const gwUrl = sessionData.mediaGatewayUrl;
  console.log(`Starting live session at ${gwUrl}...`);
  const startRes = await fetch(`${gwUrl}/v1/live/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ controlPlaneToken: sessionData.token, profile: 'sub' })
  });
  console.log('Start status:', startRes.status);
  const startData = await startRes.json().catch(async () => await startRes.text());
  console.log('Start data:', startData);

  if (startData?.hls?.url) {
    console.log('Waiting 3s for HLS segment...');
    await new Promise(r => setTimeout(r, 3000));
    const hlsRes = await fetch(startData.hls.url, {
      headers: { Authorization: `Bearer ${startData.hls.bearerToken}` }
    });
    console.log(`HLS status: ${hlsRes.status}`);
    console.log('HLS content:\n', (await hlsRes.text()).slice(0, 300));
  }
}
