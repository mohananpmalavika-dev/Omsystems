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

const agentId = '748eeb31-76f8-43e9-9121-4c1d99166e87';
const uriSub1 = 'rtsp://test:test%40123@172.28.18.100/cam/realmonitor?channel=1&subtype=1';
const uriMain1 = 'rtsp://test:test%40123@172.28.18.100/cam/realmonitor?channel=1&subtype=0';

const ref1 = `edge://${agentId}/bettaih-ch1`;
const refSub1 = `edge://${agentId}/bettaih-ch1#sub`;
const refMain1 = `edge://${agentId}/bettaih-ch1#main`;

const sql = `
BEGIN;
INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${ref1}', '${agentId}', '${encryptSecret(ref1, uriSub1)}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${refSub1}', '${agentId}', '${encryptSecret(refSub1, uriSub1)}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();

INSERT INTO central_stream_secrets (reference, edge_agent_id, encrypted_uri, updated_at)
VALUES ('${refMain1}', '${agentId}', '${encryptSecret(refMain1, uriMain1)}', now())
ON CONFLICT (reference) DO UPDATE SET edge_agent_id = EXCLUDED.edge_agent_id, encrypted_uri = EXCLUDED.encrypted_uri, updated_at = now();
COMMIT;
`;

fs.writeFileSync('scratch/insert_ch1.sql', sql, 'utf8');
console.log('Saved scratch/insert_ch1.sql');
