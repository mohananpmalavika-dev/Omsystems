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
  const [,, argUsername, argPassword, argEmail, argTenantId] = process.argv;

  const username = argUsername || 'mgdhanyamohan';
  const password = argPassword || process.env.BOOTSTRAP_SUPERADMIN_PASSWORD;
  if (!password) throw new Error('A password argument or BOOTSTRAP_SUPERADMIN_PASSWORD is required');
  const email = argEmail || 'mgdhanyamohan@omsystems.bank';

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('ERROR: DATABASE_URL must be set in environment');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' || process.env.DATABASE_SSL === 'require' || DATABASE_URL.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    await pool.query('SELECT 1');
    const passwordHash = hashPasswordSync(password);

    // Determine tenant id if not provided
    let tid = argTenantId;
    if (!tid) {
      const res = await pool.query(`SELECT id FROM tenants LIMIT 1`);
      if (res.rows.length === 0) {
        const insTenant = await pool.query(`
          INSERT INTO tenants (id, name, slug, status, created_at, updated_at)
          VALUES (gen_random_uuid(), 'OM Systems Bank', 'omsystems', 'active', now(), now())
          RETURNING id
        `);
        tid = insTenant.rows[0].id;
      } else {
        tid = res.rows[0].id;
      }
    }

    const insert = `
      INSERT INTO users (
        id, tenant_id, username, email, display_name, password_hash, role, status, active, identity_subject, created_at, updated_at
      ) VALUES (
        '00000000-0000-4000-8000-000000000001'::uuid, $1, $2, $3, 'Dhanya Mohan (Superadmin)', $4, 'super_admin', 'active', true, $5, now(), now()
      )
      ON CONFLICT (username) DO UPDATE SET
        role = 'super_admin',
        status = 'active',
        active = true,
        password_hash = EXCLUDED.password_hash,
        tenant_id = EXCLUDED.tenant_id,
        display_name = EXCLUDED.display_name,
        identity_subject = EXCLUDED.identity_subject,
        updated_at = now()
      RETURNING id, tenant_id, username, email, role, status, active;
    `;

    const values = [tid, username, email || null, passwordHash, `user-${username}`];
    const result = await pool.query(insert, values);
    console.log('✓ Superuser successfully configured in database:');
    console.table(result.rows[0]);
  } catch (err) {
    console.error('Failed to create superuser:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
