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

const branchId = 'd7b23dee-9814-48c9-8805-48b61b33e3a9';
const branchPath = 'a7130bc7_3a43_4ddb_9c74_736ddb40ea3c.ca129fa9_8fc2_4b4f_9960_adbcf6deb6ed.d7b23dee_9814_48c9_8805_48b61b33e3a9';
const edgeAgentId = '9f108498-4dd5-4a21-b810-eec9e538953c';
const tenantId = '00000000-0000-4000-8000-000000000001';
const ipAddress = '172.28.18.100';

const profiles = JSON.stringify([
  { name: 'main', role: 'main', codec: 'H264', width: 1920, height: 1080 },
  { name: 'sub', role: 'sub', codec: 'H264', width: 640, height: 360, preferredFor: ['live', 'analytics'] }
]);
const capabilities = JSON.stringify({ ptz: false, audio: false, events: true });

let sqlStatements = [];
sqlStatements.push('BEGIN;');

// 1. Ensure camera credentials for Bettaih
sqlStatements.push(`
DELETE FROM camera_credentials WHERE branch_id = '${branchId}' AND ip_address = '${ipAddress}' AND scope = 'host-specific';
INSERT INTO camera_credentials (branch_id, edge_agent_id, ip_address, username, password, scope)
VALUES ('${branchId}', '${edgeAgentId}', '${ipAddress}', 'test', 'test@123', 'host-specific');
`);

// 2. Loop through all 8 channels
for (let ch = 1; ch <= 8; ch++) {
  const channelName = `CP PLUS DVR - Channel ${ch}`;
  const secretRef = `edge://${edgeAgentId}/bettaih-ch${ch}`;
  const subSecretRef = `edge://${edgeAgentId}/bettaih-ch${ch}#sub`;
  const mainSecretRef = `edge://${edgeAgentId}/bettaih-ch${ch}#main`;

  const subUri = `rtsp://test:test%40123@${ipAddress}/cam/realmonitor?channel=${ch}&subtype=1`;
  const mainUri = `rtsp://test:test%40123@${ipAddress}/cam/realmonitor?channel=${ch}&subtype=0`;

  const encBase = encryptSecret(secretRef, subUri);
  const encSub = encryptSecret(subSecretRef, subUri);
  const encMain = encryptSecret(mainSecretRef, mainUri);

  // Central stream secrets
  sqlStatements.push(`
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${secretRef}', '${edgeAgentId}', '${encBase}', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${subSecretRef}', '${edgeAgentId}', '${encSub}', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${mainSecretRef}', '${edgeAgentId}', '${encMain}', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();
`);

  // Channel 8 compatibility alias
  if (ch === 8) {
    const dvrRef = `edge://${edgeAgentId}/dvr-ch8`;
    const encDvr = encryptSecret(dvrRef, subUri);
    const dvrCapRef = `edge://${edgeAgentId}/DVR-ch8`;
    const encDvrCap = encryptSecret(dvrCapRef, subUri);

    sqlStatements.push(`
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${dvrRef}', '${edgeAgentId}', '${encDvr}', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${dvrCapRef}', '${edgeAgentId}', '${encDvrCap}', now())
ON CONFLICT (reference) DO UPDATE SET encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();
`);
  }

  // Camera, resource node, device identity
  sqlStatements.push(`
DO $$
DECLARE
  v_cam_id uuid;
  v_node_id uuid;
  v_identity_id uuid;
  v_ltree_id text;
BEGIN
  -- Check if camera exists for this channel
  SELECT id, resource_node_id, device_identity_id INTO v_cam_id, v_node_id, v_identity_id
  FROM cameras
  WHERE branch_node_id = '${branchId}' AND ip_address = '${ipAddress}' AND recorder_channel = ${ch};

  IF v_cam_id IS NOT NULL THEN
    -- Update existing camera
    UPDATE cameras SET
      edge_agent_id = '${edgeAgentId}',
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
      recorder_id = 'recorder-bettaih-${ipAddress.replace(/\\./g, '-')}',
      recorder_channel = ${ch},
      last_seen_at = now()
    WHERE id = v_cam_id;

    IF v_node_id IS NOT NULL THEN
      UPDATE resource_nodes SET name = '${channelName}', is_active = true WHERE id = v_node_id;
    END IF;

    IF v_identity_id IS NOT NULL THEN
      UPDATE device_identities SET
        credential_ref = '${secretRef}',
        edge_agent_id = '${edgeAgentId}',
        manufacturer = 'cp-plus',
        model = '${channelName}',
        channel = ${ch},
        device_type = 'analog-dvr-channel',
        last_seen_at = now()
      WHERE id = v_identity_id;
    END IF;
  ELSE
    -- Generate fresh IDs
    v_node_id := gen_random_uuid();
    v_ltree_id := replace(v_node_id::text, '-', '_');

    -- Insert resource node
    INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path, is_active, sensitivity_level)
    VALUES (v_node_id, '${tenantId}', '${branchId}', 'camera', '${channelName}', ('${branchPath}' || '.' || v_ltree_id)::ltree, true, 'normal');

    -- Insert device identity
    INSERT INTO device_identities (
      tenant_id, branch_node_id, device_type, manufacturer, model,
      current_ip_address, channel, credential_ref, edge_agent_id, first_seen_at, last_seen_at
    ) VALUES (
      '${tenantId}', '${branchId}', 'analog-dvr-channel', 'cp-plus', '${channelName}',
      '${ipAddress}', ${ch}, '${secretRef}', '${edgeAgentId}', now(), now()
    ) RETURNING id INTO v_identity_id;

    -- Insert camera
    INSERT INTO cameras (
      resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
      vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
      connection_secret_ref, connection_transport, ip_address, source_type,
      recorder_id, recorder_channel
    ) VALUES (
      v_node_id, '${branchId}', '${edgeAgentId}', v_identity_id,
      'cp-plus', '${channelName}', ${ch}, 'rtsp', 'online'::camera_status, now(),
      '${profiles}'::jsonb, '${capabilities}'::jsonb,
      '${secretRef}', 'edge-gateway', '${ipAddress}'::inet, 'analog-dvr-channel',
      'recorder-bettaih-${ipAddress.replace(/\\./g, '-')}', ${ch}
    ) RETURNING id INTO v_cam_id;

    -- Link camera_id in device_identities
    UPDATE device_identities SET camera_id = v_cam_id WHERE id = v_identity_id;
  END IF;
END $$;
`);
}

// 3. Clean up unnumbered cameras if any exist
sqlStatements.push(`
DELETE FROM live_sessions WHERE camera_id IN (
  SELECT id FROM cameras WHERE branch_node_id = '${branchId}' AND ip_address = '${ipAddress}' AND recorder_channel IS NULL
);
DELETE FROM cameras WHERE branch_node_id = '${branchId}' AND ip_address = '${ipAddress}' AND recorder_channel IS NULL;
`);

sqlStatements.push('COMMIT;');

const fullSql = sqlStatements.join('\n');
console.log('SQL generated. Total length:', fullSql.length);

import fs from 'fs';
fs.writeFileSync('c:/Omsystems/Omsystems/scratch/setup-bettaih.sql', fullSql, 'utf8');

const base64 = Buffer.from(fullSql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log('Applying Bettaih all 8 channels configuration to Postgres...');
try {
  const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  console.log(output);
} catch (err) {
  console.error('CMD ERROR:');
  console.error('stdout:', err.stdout?.toString());
  console.error('stderr:', err.stderr?.toString());
  console.error('message:', err.message);
  throw err;
}

console.log('=== VERIFYING BETTAIH CAMERAS ===');
const verifySql = `SELECT c.id, rn.name as node_name, c.model, c.channel, c.recorder_channel, c.status, c.connection_secret_ref, c.ip_address FROM cameras c JOIN resource_nodes rn ON rn.id = c.resource_node_id WHERE c.branch_node_id = '${branchId}' ORDER BY c.recorder_channel ASC NULLS LAST;`;
const verifyBase64 = Buffer.from(verifySql).toString('base64');
const verifyCmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${verifyBase64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(verifyCmd, { encoding: 'utf8' }));
