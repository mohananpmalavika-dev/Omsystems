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
const branchId = 'd8467a57-dae8-4012-ba5e-c3254075aa61'; // PERAVARUNI
const agentId = '6dd10cd4-5625-48f4-8431-23776bbd0795'; // PERAVARUNI Scanner
const dvrIp = '172.29.91.100'; // Real Peravaruni DVR

const channelMapping = [
  { ch: 1, camId: '4d3caa3d-e03d-4689-81a6-a10e6f26329c', diId: '7865ebc4-90a7-4cf7-89f7-c56b29599eed' },
  { ch: 2, camId: 'a66bbc0b-1d47-4462-9cf7-94b5b35824df', diId: '8a8dacff-3466-4c0a-af91-e0e9f9ca8900' },
  { ch: 3, camId: '940fb6f4-7c41-4c92-b4f1-85a459ebb38d', diId: '19e92521-4df5-49ff-9728-66986472ef24' },
  { ch: 4, camId: '1fa8cd44-c782-40a3-81f2-a933fb2b1d76', diId: 'f38c207f-cbe0-4d12-97e3-cdd2184f9e3e' },
  { ch: 5, camId: '9cf710ef-1a0b-444b-9c30-abbac95948fe', diId: '19908631-2fe0-45fd-8158-ff163b7ad4cf' },
  { ch: 6, camId: 'fc1a1f29-8b1c-4743-a093-40584e1a96a8', diId: '4718366c-9acf-4162-b031-66a265573c39' },
  { ch: 7, camId: '3baa601f-67e0-4e0e-905d-0688df725bf1', diId: '18325705-cfbe-440e-bb45-e668984a9f05' },
  { ch: 8, camId: '14d869da-4642-4d74-9de0-c4c6c2be4488', diId: 'a8b9e400-2b05-4127-be7d-a47fe4c1605d' },
];

const profiles = JSON.stringify([
  { name: 'main', role: 'main', codec: 'H264', width: 1920, height: 1080 },
  { name: 'sub', role: 'sub', codec: 'H264', width: 640, height: 360, preferredFor: ['live', 'analytics'] }
]);
const capabilities = JSON.stringify({ ptz: false, audio: false, events: true });

async function main() {
  console.log('Configuring all 8 Peravaruni cameras to use PERAVARUNI Scanner and 172.29.91.100 DVR...');

  const sqlStatements = [];
  sqlStatements.push('BEGIN;');

  // Ensure branch assignment for 6dd10cd4
  sqlStatements.push(`
INSERT INTO edge_agent_branch_assignments (edge_agent_id, branch_node_id, tenant_id, scope_node_id, vpn_networks, assigned_at)
VALUES ('${agentId}', '${branchId}', '${tenantId}', '${branchId}', '["${dvrIp}/32", "192.168.250.0/24"]'::jsonb, now())
ON CONFLICT (edge_agent_id, branch_node_id) DO UPDATE
SET scope_node_id = EXCLUDED.scope_node_id, vpn_networks = EXCLUDED.vpn_networks;
`);

  for (const item of channelMapping) {
    const ch = item.ch;
    const channelName = `CP PLUS DVR - Channel ${ch}`;
    const baseRef = `edge://${agentId}/peravaruni-ch${ch}`;
    const subRef = `edge://${agentId}/peravaruni-ch${ch}#sub`;
    const mainRef = `edge://${agentId}/peravaruni-ch${ch}#main`;

    const subUri = `rtsp://test:test%40123@${dvrIp}/cam/realmonitor?channel=${ch}&subtype=1`;
    const mainUri = `rtsp://test:test%40123@${dvrIp}/cam/realmonitor?channel=${ch}&subtype=0`;

    const encBase = encryptSecret(baseRef, subUri);
    const encSub = encryptSecret(subRef, subUri);
    const encMain = encryptSecret(mainRef, mainUri);

    sqlStatements.push(`
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${baseRef}', '${agentId}', '${encBase}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${subRef}', '${agentId}', '${encSub}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${mainRef}', '${agentId}', '${encMain}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

UPDATE cameras 
SET edge_agent_id = '${agentId}',
    connection_secret_ref = '${baseRef}',
    ip_address = '${dvrIp}',
    vendor = 'cp-plus',
    model = '${channelName}',
    channel = ${ch},
    protocol = 'rtsp',
    status = 'online'::camera_status,
    profiles = '${profiles}'::jsonb,
    capabilities = '${capabilities}'::jsonb,
    source_type = 'analog-dvr-channel',
    recorder_id = 'recorder-${dvrIp}',
    recorder_channel = ${ch},
    connection_transport = 'edge-gateway',
    last_seen_at = now()
WHERE id = '${item.camId}';

UPDATE device_identities
SET edge_agent_id = '${agentId}',
    credential_ref = '${baseRef}',
    manufacturer = 'cp-plus',
    model = '${channelName}',
    channel = ${ch},
    device_type = 'analog-dvr-channel',
    last_seen_at = now(),
    updated_at = now()
WHERE id = '${item.diId}';

INSERT INTO operational_health_latest (
  tenant_id, branch_id, edge_agent_id, device_type, device_id,
  observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes
) VALUES (
  '${tenantId}', '${branchId}', '${agentId}', 'camera', '${item.camId}',
  now(), now(), 'rtsp', 'verified', '${agentId}:camera:${item.camId}:pera-live',
  '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb, '{}'
) ON CONFLICT (tenant_id, branch_id, device_type, device_id) DO UPDATE
SET quality = 'verified',
    edge_agent_id = EXCLUDED.edge_agent_id,
    metrics = '{"status": "online", "streamActive": true, "fps": 15.0, "codec": "h264", "bitrateKbps": 350, "responseTimeMs": 120}'::jsonb,
    reason_codes = '{}',
    observed_at = now(),
    received_at = now();
`);
  }

  sqlStatements.push('COMMIT;');

  const sql = sqlStatements.join('\n');
  const sqlFile = 'scratch/configure-peravaruni.sql';
  fs.writeFileSync(sqlFile, sql, 'utf8');
  console.log('Uploading SQL file to kryptovision-server...');
  execSync(`gcloud compute scp ${sqlFile} kryptovision-server:/tmp/configure-peravaruni.sql --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet`, { stdio: 'inherit' });
  console.log('Executing SQL file on sentinel-gcp-postgres...');
  const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid < /tmp/configure-peravaruni.sql"`;
  const result = execSync(cmd, { encoding: 'utf8' });
  console.log(result);

  console.log('Completed database update successfully.');
}

main().catch(console.error);
