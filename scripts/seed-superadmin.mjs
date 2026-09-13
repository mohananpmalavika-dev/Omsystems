import pg from 'pg';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const { Pool } = pg;
const scryptAsync = promisify(scrypt);

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable',
  ssl: false,
});

try {
  const username = 'mgdhanyamohan';
  const password = process.env.BOOTSTRAP_SUPERADMIN_PASSWORD || 'SentinelMasterAdmin2026!';
  const email = 'mgdhanyamohan@omsystems.bank';
  const displayName = 'Dhanya Mohan (Superadmin)';

  console.log(`Setting up superadmin user: ${username}...`);
  const passwordHash = await hashPassword(password);

  let tenant = await pool.query('SELECT id, name FROM tenants LIMIT 1');
  let tenantId;
  if (tenant.rows.length === 0) {
    const newTenant = await pool.query(
      `INSERT INTO tenants (name, slug, created_at) VALUES ('OM Systems', 'omsystems-pilot', NOW()) RETURNING id`
    );
    tenantId = newTenant.rows[0].id;
  } else {
    tenantId = tenant.rows[0].id;
  }

  const result = await pool.query(
    `INSERT INTO users (
      tenant_id, identity_subject, display_name, email, username,
      password_hash, role, status, must_change_password, active,
      login_attempts, locked_until, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'super_admin', 'active', false, true, 0, NULL, NOW(), NOW())
    ON CONFLICT (tenant_id, identity_subject) DO UPDATE SET
      username = EXCLUDED.username,
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name,
      password_hash = EXCLUDED.password_hash,
      role = 'super_admin',
      status = 'active',
      active = true,
      login_attempts = 0,
      locked_until = NULL,
      must_change_password = false,
      updated_at = NOW()
    RETURNING id, username, email, role, status`,
    [tenantId, `local:${username}`, displayName, email, username, passwordHash]
  );

  const userId = result.rows[0].id;
  console.log(`✅ Superadmin '${username}' is active! User ID: ${userId}`);

  // Organization assignment
  let company = await pool.query(
    `SELECT id FROM resource_nodes WHERE tenant_id = $1 AND node_type = 'company' LIMIT 1`,
    [tenantId]
  );
  let companyId;
  if (company.rows.length === 0) {
    const newComp = await pool.query(
      `INSERT INTO resource_nodes (tenant_id, name, node_type, code, path, is_active, created_at)
       VALUES ($1, 'OM Systems HQ', 'company', 'HQ01', 'company', true, NOW()) RETURNING id`,
      [tenantId]
    );
    companyId = newComp.rows[0].id;
  } else {
    companyId = company.rows[0].id;
  }

  await pool.query(
    `INSERT INTO user_organizational_assignments (user_id, tenant_id, scope_node_id, is_primary, assigned_at)
     VALUES ($1, $2, $3, true, NOW())
     ON CONFLICT (user_id, scope_node_id) DO UPDATE SET is_primary = true`,
    [userId, tenantId, companyId]
  );
  console.log(`✅ Assigned to primary organization node: ${companyId}`);
  console.log(`\n🎉 Superadmin credentials:`);
  console.log(`   Username: ${username}`);
  console.log(`   Password: ${password}`);

} catch (error) {
  console.error('❌ Failed to seed superadmin:', error.message);
  process.exit(1);
} finally {
  await pool.end();
}
