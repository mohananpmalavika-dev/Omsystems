import { createDecipheriv } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable'
});

async function main() {
  const res = await pool.query("SELECT reference, encrypted_uri FROM central_stream_secrets WHERE reference LIKE '%DVR-ch8%' OR reference LIKE '%dvr-ch8%'");
  console.log('Rows found:', res.rows.length);
  const key = Buffer.from('eqNsNVnJvPqhSqTktB2W2Jmjd22ycKaOj0cWL6Y+92U=', 'base64');
  
  for (const row of res.rows) {
    try {
      const payload = Buffer.from(row.encrypted_uri, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
      decipher.setAAD(Buffer.from(row.reference));
      decipher.setAuthTag(payload.subarray(12, 28));
      const decrypted = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
      console.log(`Reference: ${row.reference} -> ${decrypted}`);
    } catch (e) {
      console.error(`Failed to decrypt ${row.reference}:`, e.message);
    }
  }
  await pool.end();
}

main().catch(console.error);
