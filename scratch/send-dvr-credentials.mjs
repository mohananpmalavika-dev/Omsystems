import { createPublicKey, randomBytes, createCipheriv, publicEncrypt, constants } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

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

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable'
  });

  const branchId = '921d336d-baa9-4b25-9f9f-f6542bba94cc';
  const edgeAgentId = '9f108498-4dd5-4a21-b810-eec9e538953c';
  const targetIp = '172.29.91.100';
  const username = 'test';
  const password = 'test@123';
  const requestedBy = '00000000-0000-4000-8000-000000000201';

  console.log('1. Getting edge agent command public key...');
  const agentRes = await pool.query(
    'SELECT id, command_public_key, tenant_id FROM edge_agents WHERE id = $1',
    [edgeAgentId]
  );
  const agent = agentRes.rows[0];
  if (!agent || !agent.command_public_key) {
    throw new Error('Edge agent or command public key not found');
  }

  console.log('2. Inserting into camera_credentials...');
  await pool.query(
    `DELETE FROM camera_credentials WHERE branch_id = $1 AND ip_address = $2 AND scope = 'host-specific'`,
    [branchId, targetIp]
  );
  await pool.query(
    `INSERT INTO camera_credentials (branch_id, edge_agent_id, ip_address, username, password, scope)
     VALUES ($1, $2, $3, $4, $5, 'host-specific')`,
    [branchId, edgeAgentId, targetIp, username, password]
  );

  console.log('3. Sealing encrypted command payload...');
  const envelope = sealEdgeCommandPayload({
    username,
    password,
    scope: { host: targetIp },
    issuedAt: new Date().toISOString(),
  }, agent.command_public_key);

  console.log('4. Creating update-credentials command in edge_commands...');
  const cmdRes = await pool.query(
    `INSERT INTO edge_commands
       (tenant_id, branch_node_id, edge_agent_id, command_type, payload, requested_by)
     SELECT tenant_id, branch_node_id, id, 'update-credentials', $2::jsonb, $3
     FROM edge_agents WHERE id = $1 AND credential_revoked_at IS NULL
     RETURNING id, command_type, status, requested_at`,
    [edgeAgentId, JSON.stringify({ envelope, target: { ipAddress: targetIp } }), requestedBy]
  );

  console.log('Command created successfully:', cmdRes.rows[0]);

  await pool.end();
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
