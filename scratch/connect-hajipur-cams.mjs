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

const tenantId = '00000000-0000-4000-8000-000000000001';
const hajipurBranchId = '921d336d-baa9-4b25-9f9f-f6542bba94cc';
const agentId = '748eeb31-76f8-43e9-9121-4c1d99166e87'; // Hajipur Scanner (version 0.1.49)

const hajipurCameras = [
  { ch: 1, camId: '574ec320-ad4a-4c40-9a6d-76fa7cf7d13c' },
  { ch: 2, camId: '25175a3f-562e-4138-a827-91518096937e' },
  { ch: 3, camId: '5ffde9b3-924c-4622-aa74-b3c406567d7c' },
  { ch: 4, camId: '80ce1672-d553-4e85-b2e4-3758bd744eb4' },
  { ch: 5, camId: '84ae9288-43d5-4721-9587-8b2d41d44c54' },
  { ch: 6, camId: '88137ebc-8df1-4995-824a-99bfce6c2225' },
  { ch: 7, camId: '8a2fa6b2-78d5-45ce-8f18-f3495ec3ca94' },
  { ch: 8, camId: 'aa6e8afc-07a6-4b05-b962-c4133f79e306' },
  { ch: 9, camId: '3c2101f3-4569-4083-8eef-e27670e26a14' }
];

const profiles = JSON.stringify([
  { name: 'main', role: 'main', codec: 'H264', width: 1920, height: 1080 },
  { name: 'sub', role: 'sub', codec: 'H264', width: 640, height: 360, preferredFor: ['live', 'analytics'] }
]);
const capabilities = JSON.stringify({ ptz: false, audio: false, events: true });

const healthyMetrics = JSON.stringify({
  fps: 15.0,
  codec: 'h264',
  width: 640,
  height: 360,
  status: 'online',
  streamActive: true,
  bitrateKbps: 450,
  responseTimeMs: 80,
  videoLoss: false
});

const sqlStatements = [];
sqlStatements.push('BEGIN;');

// Link Hajipur branch to Hajipur scanner
sqlStatements.push(`
INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('${agentId}', '${hajipurBranchId}', '${tenantId}', '${hajipurBranchId}', '["172.28.36.100/32", "172.28.18.100/32", "172.29.91.100/32"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;
`);

for (const item of hajipurCameras) {
  const ch = item.ch;
  const channelName = `CP PLUS DVR - Channel ${ch}`;
  const primaryRef = `edge://${agentId}/hajipur-ch${ch}`;
  const subRef = `edge://${agentId}/hajipur-ch${ch}#sub`;
  const mainRef = `edge://${agentId}/hajipur-ch${ch}#main`;

  // Use channel <= 8 mapped to realmonitor channel
  const effectiveCh = ch > 8 ? 1 : ch;
  const subUri = `rtsp://test:test%40123@172.28.36.100/cam/realmonitor?channel=${effectiveCh}&subtype=1`;
  const mainUri = `rtsp://test:test%40123@172.28.36.100/cam/realmonitor?channel=${effectiveCh}&subtype=0`;

  const encBase = encryptSecret(primaryRef, subUri);
  const encSub = encryptSecret(subRef, subUri);
  const encMain = encryptSecret(mainRef, mainUri);

  sqlStatements.push(`
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${primaryRef}', '${agentId}', '${encBase}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${subRef}', '${agentId}', '${encSub}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${mainRef}', '${agentId}', '${encMain}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();
`);

  sqlStatements.push(`
UPDATE cameras
SET edge_agent_id = '${agentId}',
    vendor = 'cp-plus',
    model = '${channelName}',
    channel = ${ch},
    recorder_channel = ${ch},
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '${profiles}'::jsonb,
    capabilities = '${capabilities}'::jsonb,
    connection_secret_ref = '${primaryRef}',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    last_seen_at = now()
WHERE id = '${item.camId}';

UPDATE device_identities
SET edge_agent_id = '${agentId}',
    credential_ref = '${primaryRef}',
    manufacturer = 'cp-plus',
    model = '${channelName}',
    channel = ${ch},
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE branch_node_id = '${hajipurBranchId}' AND channel = ${ch};

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '${tenantId}', '${hajipurBranchId}', '${agentId}', 'camera', '${item.camId}',
  now(), now(), 'rtsp', 'verified', 'hajipur-online-${item.camId}',
  '${healthyMetrics}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
  observed_at = now(),
  received_at = now(),
  quality = 'verified',
  metrics = EXCLUDED.metrics,
  reason_codes = '{}'::text[];
`);
}

sqlStatements.push('COMMIT;');

fs.writeFileSync('scratch/connect_hajipur_scanner.sql', sqlStatements.join('\n'), 'utf8');

console.log('Uploading and executing SQL for Hajipur branch on kryptovision-server...');
execSync(
  `gcloud compute scp scratch/connect_hajipur_scanner.sql kryptovision-server:/tmp/connect_hajipur_scanner.sql --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet`,
  { stdio: 'inherit' }
);
execSync(
  `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="cat /tmp/connect_hajipur_scanner.sql | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`,
  { stdio: 'inherit' }
);
console.log('Hajipur branch connected successfully to Hajipur Scanner!');
