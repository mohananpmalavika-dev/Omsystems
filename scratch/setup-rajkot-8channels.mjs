import { randomBytes, createCipheriv, createPublicKey, publicEncrypt, constants } from 'node:crypto';
import { execSync } from 'node:child_process';

const STREAM_VAULT_KEY = Buffer.from('eqNsNVnJvPqhSqTktB2W2Jmjd22ycKaOj0cWL6Y+92U=', 'base64');

function encryptVaultSecret(reference, uri) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', STREAM_VAULT_KEY, iv);
  cipher.setAAD(Buffer.from(reference));
  const ciphertext = Buffer.concat([cipher.update(uri, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

function sealEdgeCommandPayload(payload, commandPublicKeyPem) {
  const publicKey = createPublicKey(commandPublicKeyPem);
  if (publicKey.asymmetricKeyType !== "rsa") throw new Error("invalid_gateway_command_key");
  const contentKey = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", contentKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const wrappedKey = publicEncrypt({
    key: publicKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  }, contentKey);
  return {
    algorithm: "RSA-OAEP-256+A256GCM",
    wrappedKey: wrappedKey.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

import fs from 'node:fs';

function runRemoteSql(sql) {
  const sqlFile = 'scratch/setup-rajkot.sql';
  fs.writeFileSync(sqlFile, sql, 'utf8');
  console.log('Uploading SQL file to kryptovision-server...');
  execSync(`gcloud compute scp ${sqlFile} kryptovision-server:/tmp/setup-rajkot.sql --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804`, { stdio: 'inherit' });
  console.log('Executing SQL file on sentinel-gcp-postgres...');
  const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid < /tmp/setup-rajkot.sql"`;
  return execSync(cmd, { encoding: 'utf8' });
}

function runRemoteQuery(sql) {
  const base64 = Buffer.from(sql).toString('base64');
  const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
  return execSync(cmd, { encoding: 'utf8' });
}

async function main() {
  const branchId = '6ddee070-9050-4f55-aaa1-1190654bbc6b';
  const edgeAgentId = '9f108498-4dd5-4a21-b810-eec9e538953c';
  const tenantId = '00000000-0000-4000-8000-000000000001';
  const targetIp = '172.28.36.100';
  const username = 'test';
  const password = 'test@123';
  const requestedBy = '00000000-0000-4000-8000-000000000201';

  console.log('1. Verifying branch and agent info...');
  const branchPath = 'a7130bc7_3a43_4ddb_9c74_736ddb40ea3c.db6a3d17_5811_492c_93c7_0eb37e7c0e90.6ddee070_9050_4f55_aaa1_1190654bbc6b';

  console.log('2. Generating SQL transaction for Rajkot 8 channels...');
  let sql = `
BEGIN;

-- 2.1 Ensure Rajkot exists in branches table
INSERT INTO branches (id, tenant_id, name, status, metadata, created_at, updated_at)
VALUES (
  '${branchId}',
  '${tenantId}',
  'Rajkot',
  'ACTIVE',
  '{"source": "resource_nodes"}'::jsonb,
  now(),
  now()
) ON CONFLICT (id) DO UPDATE 
SET name = 'Rajkot', status = 'ACTIVE', updated_at = now();

-- 2.2 Clean any previous records for 172.28.36.100 in Rajkot if any
DELETE FROM live_sessions WHERE camera_id IN (SELECT id FROM cameras WHERE branch_node_id = '${branchId}' AND ip_address = '${targetIp}');
DELETE FROM cameras WHERE branch_node_id = '${branchId}' AND ip_address = '${targetIp}';
DELETE FROM device_identities WHERE branch_node_id = '${branchId}' AND current_ip_address = '${targetIp}';
DELETE FROM resource_nodes WHERE parent_id = '${branchId}' AND name LIKE 'Rajkot - Channel %';

-- 2.3 Ensure camera_credentials record
DELETE FROM camera_credentials WHERE branch_id = '${branchId}' AND ip_address = '${targetIp}';
INSERT INTO camera_credentials (branch_id, edge_agent_id, ip_address, username, password, scope)
VALUES ('${branchId}', '${edgeAgentId}', '${targetIp}', '${username}', '${password}', 'host-specific');
`;

  // 2.4 Build channels 1 to 8
  const streamSecretsToInsert = [];

  for (let ch = 1; ch <= 8; ch++) {
    const channelName = `Rajkot - Channel ${ch}`;
    const modelName = `CP PLUS DVR - Channel ${ch}`;
    const baseRef = `edge://${edgeAgentId}/rajkot-ch${ch}`;
    const subRef = `${baseRef}#sub`;
    const mainRef = `${baseRef}#main`;

    const subUri = `rtsp://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${targetIp}/cam/realmonitor?channel=${ch}&subtype=1`;
    const mainUri = `rtsp://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${targetIp}/cam/realmonitor?channel=${ch}&subtype=0`;

    streamSecretsToInsert.push({ ref: baseRef, enc: encryptVaultSecret(baseRef, subUri) });
    streamSecretsToInsert.push({ ref: subRef, enc: encryptVaultSecret(subRef, subUri) });
    streamSecretsToInsert.push({ ref: mainRef, enc: encryptVaultSecret(mainRef, mainUri) });

    const profiles = JSON.stringify([
      { name: 'main', role: 'main', codec: 'H264', width: 1920, height: 1080 },
      { name: 'sub', role: 'sub', codec: 'H264', width: 640, height: 360, preferredFor: ['live', 'analytics'] }
    ]);
    const capabilities = JSON.stringify({ ptz: false, audio: false, events: true });

    sql += `
-- Channel ${ch}
DO $$
DECLARE
  v_node_id uuid := gen_random_uuid();
  v_identity_id uuid := gen_random_uuid();
  v_camera_id uuid := gen_random_uuid();
  v_ltree_id text;
BEGIN
  v_ltree_id := replace(v_node_id::text, '-', '_');

  -- Resource Node
  INSERT INTO resource_nodes (id, tenant_id, parent_id, node_type, name, path, is_active, sensitivity_level, created_at, updated_at)
  VALUES (
    v_node_id,
    '${tenantId}',
    '${branchId}',
    'camera',
    '${channelName}',
    ('${branchPath}' || '.' || v_ltree_id)::ltree,
    true,
    'normal',
    now(),
    now()
  );

  -- Device Identity
  INSERT INTO device_identities (
    id, tenant_id, branch_node_id, device_type, manufacturer, model,
    current_ip_address, channel, credential_ref, edge_agent_id,
    first_seen_at, last_seen_at, created_at, updated_at
  ) VALUES (
    v_identity_id,
    '${tenantId}',
    '${branchId}',
    'analog-dvr-channel',
    'CP PLUS',
    '${modelName}',
    '${targetIp}',
    ${ch},
    '${baseRef}',
    '${edgeAgentId}',
    now(),
    now(),
    now(),
    now()
  );

  -- Camera
  INSERT INTO cameras (
    id, resource_node_id, branch_node_id, edge_agent_id, device_identity_id,
    vendor, model, channel, protocol, status, last_seen_at, profiles, capabilities,
    connection_secret_ref, connection_transport, ip_address, source_type,
    recorder_id, recorder_channel, sensitivity_level, first_seen_at, created_at
  ) VALUES (
    v_camera_id,
    v_node_id,
    '${branchId}',
    '${edgeAgentId}',
    v_identity_id,
    'cp-plus',
    '${modelName}',
    ${ch},
    'rtsp',
    'online'::camera_status,
    now(),
    '${profiles}'::jsonb,
    '${capabilities}'::jsonb,
    '${baseRef}',
    'edge-gateway',
    '${targetIp}'::inet,
    'analog-dvr-channel',
    'recorder-rajkot-172-28-36-100',
    ${ch},
    'internal',
    now(),
    now()
  );

  -- Update camera_id on device_identities
  UPDATE device_identities SET camera_id = v_camera_id WHERE id = v_identity_id;

END $$;
`;
  }

  // 2.5 Central stream secrets
  for (const s of streamSecretsToInsert) {
    sql += `
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${s.ref}', '${edgeAgentId}', '${s.enc}', now())
ON CONFLICT (reference) DO UPDATE
SET edge_agent_id = EXCLUDED.edge_agent_id,
    encrypted_uri = EXCLUDED.encrypted_uri,
    updated_at = now();
`;
  }

  sql += `
COMMIT;
`;

  console.log('3. Applying database configuration on server...');
  const res = runRemoteSql(sql);
  console.log(res);

  console.log('4. Verifying created cameras in database...');
  const verifySql = `
SELECT c.id, rn.name as node_name, c.model, c.channel, c.status, c.ip_address, c.connection_secret_ref
FROM cameras c
JOIN resource_nodes rn ON rn.id = c.resource_node_id
WHERE c.branch_node_id = '${branchId}' AND c.ip_address = '${targetIp}'
ORDER BY c.channel ASC;
`;
  console.log(runRemoteQuery(verifySql));

  console.log('5. Verifying central stream secrets in database...');
  const verifySecretsSql = `
SELECT reference, edge_agent_id, updated_at FROM central_stream_secrets WHERE reference LIKE '%rajkot-ch%' ORDER BY reference;
`;
  console.log(runRemoteQuery(verifySecretsSql));

  console.log('All 8 channels for Branch Rajkot with IP 172.28.36.100 successfully added!');
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
