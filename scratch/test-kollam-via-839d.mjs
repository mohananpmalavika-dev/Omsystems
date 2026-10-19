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

const agentId = '839d2a88-2b36-4e34-bd99-6cb247e196a5'; // Bettaih working agent
const base = "https://35-200-130-81.sslip.io";

const loginRes = await fetch(`${base}/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test@123" })
});
const loginData = await loginRes.json();
const token = loginData.accessToken || loginData.token;

// Kollam cameras
const kollamCameras = [
  { ch: 1, camId: 'b7a24b40-013d-40c9-bd46-823cbcf6e326' },
  { ch: 2, camId: 'c7ef14ba-67eb-4d15-a173-9c56d51bbb53' },
  { ch: 3, camId: 'da907692-01fd-4bf4-b305-f7259c05c887' },
  { ch: 4, camId: '3da93c6e-6824-43dc-9bba-7332707d5856' },
  { ch: 5, camId: 'cf27a4e8-23e4-4c4a-8e57-b49eef8302b2' },
  { ch: 6, camId: 'c365a8e7-68a8-44bb-a63f-aae73dca7526' },
  { ch: 7, camId: '99455d3a-3411-43ad-b756-84a4ae17c026' },
  { ch: 8, camId: 'fb465a8f-5d79-4a3f-9cb8-b8cec471708d' }
];

const sql = [];
sql.push('BEGIN;');
for (const item of kollamCameras) {
  const ch = item.ch;
  const primaryRef = `edge://${agentId}/kollam-ch${ch}`;
  const subRef = `edge://${agentId}/kollam-ch${ch}#sub`;
  const mainRef = `edge://${agentId}/kollam-ch${ch}#main`;
  const subUri = `rtsp://test:test%40123@172.28.18.100/cam/realmonitor?channel=${ch}&subtype=1`;
  const mainUri = `rtsp://test:test%40123@172.28.18.100/cam/realmonitor?channel=${ch}&subtype=0`;

  sql.push(`
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${primaryRef}', '${agentId}', '${encryptSecret(primaryRef, subUri)}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${subRef}', '${agentId}', '${encryptSecret(subRef, subUri)}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${mainRef}', '${agentId}', '${encryptSecret(mainRef, mainUri)}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras
SET edge_agent_id = '${agentId}',
    connection_secret_ref = '${primaryRef}',
    status = 'online'::camera_status
WHERE id = '${item.camId}';
`);
}
sql.push('COMMIT;');

const b64 = Buffer.from(sql.join('\n')).toString('base64');
execSync(
  `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
  { stdio: 'inherit' }
);

console.log("\nTesting all 8 Kollam channels on agent 839d2a88...");
for (const item of kollamCameras) {
  try {
    const sRes = await fetch(`${base}/v1/cameras/${item.camId}/live-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
      body: JSON.stringify({ profile: "sub" })
    });
    const sData = await sRes.json();
    const startRes = await fetch(`${sData.mediaGatewayUrl}/v1/live/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ controlPlaneToken: sData.token })
    });
    const startData = await startRes.json();
    if (!startData.hls) {
      console.log(`❌ Ch ${item.ch}: start failed`, startData);
      continue;
    }
    const hlsRes = await fetch(`${startData.hls.url}?token=${startData.hls.bearerToken}`);
    if (hlsRes.status === 200) {
      const txt = await hlsRes.text();
      const bw = txt.match(/BANDWIDTH=(\d+)/)?.[1] || "ok";
      console.log(`✅ Ch ${item.ch} (Camera ${item.camId.slice(0, 8)}): HLS 200 OK (Bandwidth: ${bw})`);
    } else {
      console.log(`❌ Ch ${item.ch}: status ${hlsRes.status}`);
    }
  } catch (e) {
    console.log(`❌ Ch ${item.ch}: error ${e.message}`);
  }
}
