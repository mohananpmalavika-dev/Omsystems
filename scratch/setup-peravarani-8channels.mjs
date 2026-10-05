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

const branchId = 'd8467a57-dae8-4012-ba5e-c3254075aa61';
const edgeAgentId = '9f108498-4dd5-4a21-b810-eec9e538953c';
const tenantId = '00000000-0000-4000-8000-000000000001';
const ipAddress = '172.29.55.100';

const profiles = JSON.stringify([
  { name: 'main', role: 'main', codec: 'H264', width: 1920, height: 1080 },
  { name: 'sub', role: 'sub', codec: 'H264', width: 640, height: 360, preferredFor: ['live', 'analytics'] }
]);
const capabilities = JSON.stringify({ ptz: false, audio: false, events: true });

function runRemoteSql(sql) {
  const sqlFile = 'scratch/setup-peravarani.sql';
  fs.writeFileSync(sqlFile, sql, 'utf8');
  console.log('Uploading SQL file to kryptovision-server...');
  execSync(`gcloud compute scp ${sqlFile} kryptovision-server:/tmp/setup-peravarani.sql --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804`, { stdio: 'inherit' });
  console.log('Executing SQL file on sentinel-gcp-postgres...');
  const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid < /tmp/setup-peravarani.sql"`;
  return execSync(cmd, { encoding: 'utf8' });
}

function runRemoteQuery(sql) {
  const base64 = Buffer.from(sql).toString('base64');
  const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
  return execSync(cmd, { encoding: 'utf8' });
}

async function main() {
  console.log('1. Phase 1: Cleanup transaction for duplicate Peravaruni camera...');

  // PHASE 1: Cleanup the duplicate camera (separate transaction - no resource_node delete due to audit_events FK)
  const cleanupSql = `
BEGIN;

-- Fix branch name
INSERT INTO branches (id, tenant_id, name, status, metadata, created_at, updated_at)
VALUES (
  '${branchId}',
  '${tenantId}',
  'PERAVARUNI',
  'ACTIVE',
  '{"source": "resource_nodes"}'::jsonb,
  now(),
  now()
) ON CONFLICT (id) DO UPDATE 
SET name = 'PERAVARUNI', status = 'ACTIVE', updated_at = now();

-- Delete camera_discoveries first (fixes FK violation for device_identities)
DELETE FROM camera_discoveries WHERE device_identity_id = '3747dc62-3e32-43fb-9467-1e2175097c2c';

-- Clean up duplicate channel 1 camera (414fcc24), skip resource_node (has audit_events references)
DELETE FROM live_sessions WHERE camera_id = '414fcc24-180c-4e0a-8b58-efba9b705e3f';
DELETE FROM operational_health_telemetry WHERE device_id = '414fcc24-180c-4e0a-8b58-efba9b705e3f';
DELETE FROM operational_health_latest WHERE device_id = '414fcc24-180c-4e0a-8b58-efba9b705e3f';
DELETE FROM cameras WHERE id = '414fcc24-180c-4e0a-8b58-efba9b705e3f';
DELETE FROM device_identities WHERE id = '3747dc62-3e32-43fb-9467-1e2175097c2c';

-- Ensure camera credentials for Peravaruni
DELETE FROM camera_credentials WHERE branch_id = '${branchId}' AND ip_address = '${ipAddress}' AND scope = 'host-specific';
INSERT INTO camera_credentials (branch_id, edge_agent_id, ip_address, username, password, scope)
VALUES ('${branchId}', '${edgeAgentId}', '${ipAddress}', 'test', 'test@123', 'host-specific');

COMMIT;
`;

  console.log('  Applying cleanup transaction...');
  const cleanupRes = runRemoteSql(cleanupSql);
  console.log(cleanupRes);

  // PHASE 2: Secrets + camera updates in a second transaction
  console.log('2. Phase 2: Inserting secrets and updating cameras...');
  let sqlStatements = [];
  sqlStatements.push('BEGIN;');

  // Specific camera mapping for Peravaruni
  const channelMapping = [
    { ch: 1, camId: '4d3caa3d-e03d-4689-81a6-a10e6f26329c', nodeId: '6db62dfc-99e5-4279-9926-1a1e6f722c05', diId: '7865ebc4-90a7-4cf7-89f7-c56b29599eed' },
    { ch: 2, camId: 'a66bbc0b-1d47-4462-9cf7-94b5b35824df', nodeId: '3353acf8-cd6c-4f31-aa83-ec8b1438b324', diId: '8a8dacff-3466-4c0a-af91-e0e9f9ca8900' },
    { ch: 3, camId: '940fb6f4-7c41-4c92-b4f1-85a459ebb38d', nodeId: 'bf4e8b88-efac-437b-a5d6-0c633f840446', diId: '19e92521-4df5-49ff-9728-66986472ef24' },
    { ch: 4, camId: '1fa8cd44-c782-40a3-81f2-a933fb2b1d76', nodeId: 'a8a43417-3d36-431a-beb3-d62db215e1ce', diId: 'f38c207f-cbe0-4d12-97e3-cdd2184f9e3e' },
    { ch: 5, camId: '9cf710ef-1a0b-444b-9c30-abbac95948fe', nodeId: '13ad09c4-1efd-4a72-a222-1864bb356a26', diId: '19908631-2fe0-45fd-8158-ff163b7ad4cf' },
    { ch: 6, camId: 'fc1a1f29-8b1c-4743-a093-40584e1a96a8', nodeId: '2f610afd-1bed-4438-ab81-2fe4dd20b0db', diId: '4718366c-9acf-4162-b031-66a265573c39' },
    { ch: 7, camId: '3baa601f-67e0-4e0e-905d-0688df725bf1', nodeId: '427dce43-3832-42f5-9cde-92337ce690e0', diId: '18325705-cfbe-440e-bb45-e668984a9f05' },
    { ch: 8, camId: '14d869da-4642-4d74-9de0-c4c6c2be4488', nodeId: 'cb1ddd34-aea7-4356-9adc-aa2aba9c0d7d', diId: 'a8b9e400-2b05-4127-be7d-a47fe4c1605d' },
  ];

  for (const item of channelMapping) {
    const ch = item.ch;
    const channelName = `CP PLUS DVR - Channel ${ch}`;
    const secretRef = `edge://${edgeAgentId}/peravaruni-ch${ch}`;
    const subSecretRef = `edge://${edgeAgentId}/peravaruni-ch${ch}#sub`;
    const mainSecretRef = `edge://${edgeAgentId}/peravaruni-ch${ch}#main`;

    const subUri = `rtsp://test:test%40123@${ipAddress}/cam/realmonitor?channel=${ch}&subtype=1`;
    const mainUri = `rtsp://test:test%40123@${ipAddress}/cam/realmonitor?channel=${ch}&subtype=0`;

    const encBase = encryptSecret(secretRef, subUri);
    const encSub = encryptSecret(subSecretRef, subUri);
    const encMain = encryptSecret(mainSecretRef, mainUri);

    // Insert/update stream secrets
    sqlStatements.push(`
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${secretRef}', '${edgeAgentId}', '${encBase}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${subSecretRef}', '${edgeAgentId}', '${encSub}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${mainSecretRef}', '${edgeAgentId}', '${encMain}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();
`);

    // Update resource node
    sqlStatements.push(`
UPDATE resource_nodes 
SET name = '${channelName}', is_active = true, updated_at = now() 
WHERE id = '${item.nodeId}';
`);

    // Update device identity
    sqlStatements.push(`
UPDATE device_identities 
SET credential_ref = '${secretRef}',
    edge_agent_id = '${edgeAgentId}',
    manufacturer = 'cp-plus',
    model = '${channelName}',
    channel = ${ch},
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '${item.diId}';
`);

    // Update camera
    sqlStatements.push(`
UPDATE cameras 
SET edge_agent_id = '${edgeAgentId}',
    vendor = 'cp-plus',
    model = '${channelName}',
    channel = ${ch},
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '${profiles}'::jsonb,
    capabilities = '${capabilities}'::jsonb,
    connection_secret_ref = '${secretRef}',
    connection_transport = 'edge-gateway',
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-peravaruni-172-29-55-100',
    recorder_channel = ${ch},
    last_seen_at = now()
WHERE id = '${item.camId}';
`);

    // Upsert operational health
    const metricsJson = JSON.stringify({
      fps: 15.75, codec: 'hevc', width: 352, height: 288,
      status: 'online', videoLoss: false, blueScreen: false, colourLoss: false,
      severeBlur: false, bitrateKbps: 175, blackScreen: false, imageFrozen: false,
      streamActive: true, excessiveNoise: false, responseTimeMs: 3500,
      brightnessFailure: false, packetLossPercent: 0, rollingInterference: false,
      obstructionSuspected: false, cameraMovementSuspected: false
    });

    sqlStatements.push(`
INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '${tenantId}', '${branchId}', '${edgeAgentId}', 'camera', '${item.camId}',
  now(), now(), 'rtsp', 'verified', '${edgeAgentId}:camera:${item.camId}:init-online',
  '${metricsJson}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified', metrics = '${metricsJson}'::jsonb, reason_codes = '{}',
    edge_agent_id = EXCLUDED.edge_agent_id, observed_at = now(), received_at = now();

INSERT INTO operational_health_telemetry (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '${tenantId}', '${branchId}', '${edgeAgentId}', 'camera', '${item.camId}',
  now(), now(), 'rtsp', 'verified', '${edgeAgentId}:camera:${item.camId}:${Date.now()}${ch}',
  '${metricsJson}'::jsonb, '{}'
) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
`);
  }

  sqlStatements.push('COMMIT;');

  const fullSql = sqlStatements.join('\n');
  console.log('2. Applying SQL transaction to remote server...');
  const res = runRemoteSql(fullSql);
  console.log(res);

  console.log('3. Verifying updated cameras in Peravaruni...');
  const verifySql = `
SELECT c.id, rn.name as camera_name, c.channel, c.status, c.ip_address, c.connection_secret_ref, c.edge_agent_id
FROM cameras c
JOIN resource_nodes rn ON rn.id = c.resource_node_id
WHERE c.branch_node_id = '${branchId}'
ORDER BY c.channel ASC;

SELECT device_id, branch_id, quality, metrics->>'status' as status, reason_codes, observed_at
FROM operational_health_latest
WHERE branch_id = '${branchId}' AND device_type = 'camera'
ORDER BY observed_at DESC;

SELECT COUNT(*) as secrets_count FROM central_stream_secrets
WHERE reference LIKE '%peravaruni-%';
`;
  console.log(runRemoteQuery(verifySql));

  console.log('\nAll Peravaruni branch cameras are now configured and set online!');
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
