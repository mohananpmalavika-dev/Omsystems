#!/usr/bin/env node
import { randomBytes, scryptSync } from 'node:crypto';
import { promisify } from 'node:util';
import { Pool } from 'pg';

function toBase64Url(buf) {
  return buf.toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
}

function hashPasswordSync(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

async function main() {
  const [,, username, password, email, tenantId] = process.argv;

  if (!username || !password) {
    console.error('Usage: node backend/scripts/create-superuser.mjs <username> <password> [email] [tenantId]');
    process.exit(1);
  }

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('ERROR: DATABASE_URL must be set in environment');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('render.com') || DATABASE_URL.includes('heroku.com')
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    await pool.query('SELECT 1');
    const passwordHash = hashPasswordSync(password);

    // Determine tenant id if not provided
    let tid = tenantId;
    if (!tid) {
      const res = await pool.query(`SELECT id FROM tenants LIMIT 1`);
      if (res.rows.length === 0) {
        console.error('ERROR: No tenants found in database; provide tenantId as 4th argument');
        process.exit(1);
      }
      tid = res.rows[0].id;
    }

    const insert = `
      INSERT INTO users (id, tenant_id, username, email, password_hash, role, status, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'super_admin', 'active', now(), now())
      RETURNING id, tenant_id, username, email, role, status;
    `;

    const values = [tid, username, email || null, passwordHash];
    const result = await pool.query(insert, values);
    console.log('Superuser created:');
    console.table(result.rows[0]);
  } catch (err) {
    console.error('Failed to create superuser:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
