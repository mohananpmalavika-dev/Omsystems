import { execSync } from 'child_process';

const code = `
import { CentralStreamVault } from '/app/dist/src/security/vault/central-stream-vault.js';
import pg from 'pg';
import { loadConfig } from '/app/dist/src/config.js';

const pool = new pg.Pool({ connectionString: loadConfig().DATABASE_URL });
const vault = new CentralStreamVault();

const branch = '00000000-0000-4000-8000-000000000104';
const oldAgent = 'e9b95595-1aa6-4a14-9f5d-bd0c958d3f34';
const newAgent = 'b950f232-557e-42cd-8bc8-8f4490d0b68b';

const rows = (await pool.query(
  "SELECT reference, encrypted_uri FROM central_stream_secrets WHERE reference LIKE 'edge://%' ORDER BY updated_at DESC"
)).rows;

console.log('Total secrets in DB:', rows.length);

for (const r of rows) {
  if (r.reference.includes(newAgent) || r.reference.includes(oldAgent)) {
    try {
      const dec = vault.decrypt(r.reference, r.encrypted_uri);
      console.log('OK:', r.reference, dec.replace(/:[^:@]+@/, ':***@'));
    } catch (e) {
      console.log('FAIL:', r.reference, e.message);
      // Try decrypting with oldAgent reference if this is a newAgent row
      if (r.reference.includes(newAgent)) {
        const altRef = r.reference.replace(newAgent, oldAgent);
        try {
          const dec = vault.decrypt(altRef, r.encrypted_uri);
          console.log('  -> Recovered with old reference:', dec.replace(/:[^:@]+@/, ':***@'));
          // Re-encrypt with correct new reference!
          const newEnc = vault.encrypt(r.reference, dec);
          await pool.query(
            "UPDATE central_stream_secrets SET encrypted_uri = $1 WHERE reference = $2",
            [newEnc, r.reference]
          );
          console.log('  -> RE-ENCRYPTED and updated in DB for', r.reference);
        } catch (e2) {
          console.log('  -> Alt fail:', e2.message);
        }
      }
    }
  }
}

await pool.end();
`;

const b64 = Buffer.from(code).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node -"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
