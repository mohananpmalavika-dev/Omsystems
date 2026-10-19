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

const agentHajipur = '748eeb31-76f8-43e9-9121-4c1d99166e87';
const camId = 'b7a24b40-013d-40c9-bd46-823cbcf6e326'; // Kollam ch 1
const secretRef = `edge://${agentHajipur}/kollam-ch1`;
const subRef = `edge://${agentHajipur}/kollam-ch1#sub`;
// Use working demo stream RTSP
const rtspUri = 'rtsp://test:test%40123@172.29.91.100/cam/realmonitor?channel=1&subtype=1';

const encBase = encryptSecret(secretRef, rtspUri);
const encSub = encryptSecret(subRef, rtspUri);

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
console.log("Applying test secret for Kollam ch 1...");
execSync(
  `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
  { stdio: 'inherit' }
);
console.log("Applied! Now testing live session...");

// Now test live session
const base = "https://35-200-130-81.sslip.io";
const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

const sRes = await fetch(`${base}/v1/cameras/${camId}/live-sessions`, {
  method: "POST",
  headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
  body: JSON.stringify({ profile: "sub" })
});
const sData = await sRes.json();
console.log("mediaGatewayUrl:", sData.mediaGatewayUrl);

const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ controlPlaneToken: sData.token })
});
const startData = await startRes.json();
console.log("Start status:", startRes.status);
if (startData.hls) {
  console.log("Fetching HLS playlist:", startData.hls.url);
  const hlsRes = await fetch(`${startData.hls.url}?token=${startData.hls.bearerToken}`);
  console.log("HLS Status:", hlsRes.status);
  console.log("HLS Body:\n", (await hlsRes.text()).slice(0, 200));
}
