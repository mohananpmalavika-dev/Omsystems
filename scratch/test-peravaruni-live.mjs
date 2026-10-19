import { createCipheriv, randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';

const STREAM_VAULT_KEY = 'eqNsNVnJvPqhSqTktB2W2Jmjd22ycKaOj0cWL6Y+92U=';
const key = Buffer.from(STREAM_VAULT_KEY, 'base64');

function encryptSecret(reference, sourceUri) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(reference));
  const ciphertext = Buffer.concat([cipher.update(sourceUri, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

const base = "https://35-200-130-81.sslip.io";
const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

const agentHajipur = '748eeb31-76f8-43e9-9121-4c1d99166e87';

// Test camera 26c0477d-c9b3-4374-8ea8-641337d7e8c1 (Peravaruni Ch 1)
const camId = '26c0477d-c9b3-4374-8ea8-641337d7e8c1';

// Try with 172.29.55.100 first, then 172.28.36.100 if needed
const testUris = [
  'rtsp://test:test%40123@172.29.55.100/cam/realmonitor?channel=1&subtype=1',
  'rtsp://test:test%40123@172.28.36.100/cam/realmonitor?channel=1&subtype=1',
];

for (const uri of testUris) {
  console.log(`\n--- TESTING RTSP URI: ${uri} ---`);
  const secretRef = `edge://${agentHajipur}/peravaruni-ch1-test`;
  const subRef = `edge://${agentHajipur}/peravaruni-ch1-test#sub`;
  const encBase = encryptSecret(secretRef, uri);
  const encSub = encryptSecret(subRef, uri);

  const sql = `
BEGIN;
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${secretRef}', '${agentHajipur}', '${encBase}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${subRef}', '${agentHajipur}', '${encSub}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras
SET edge_agent_id = '${agentHajipur}',
    connection_secret_ref = '${secretRef}'
WHERE id = '${camId}';
COMMIT;
`;

  const b64 = Buffer.from(sql).toString('base64');
  execSync(
    `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
    { encoding: 'utf8' }
  );

  const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
    body: JSON.stringify({ profile: "sub" })
  });
  const sData = await sRes.json();
  console.log("live-session res:", sData);
  if (!sData.token || !sData.mediaGatewayUrl) continue;

  const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ controlPlaneToken: sData.token })
  });
  const startData = await startRes.json();
  console.log("start res status:", startRes.status, startData);
  if (startRes.status === 201 && startData.hls) {
    const hlsRes = await fetch(`${startData.hls.url}?token=${startData.hls.bearerToken}`);
    console.log("HLS Status:", hlsRes.status);
    if (hlsRes.status === 200) {
      console.log("HLS body preview:", (await hlsRes.text()).slice(0, 150));
      console.log(`>>> SUCCESS WITH URI: ${uri}`);
      break;
    }
  }
}
