import pg from "pg";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const accountSpecsJson = process.env.LOGIN_ACCOUNT_SPECS;
const connectionString = process.env.DATABASE_URL;

if (!connectionString || !accountSpecsJson) {
  throw new Error("DATABASE_URL and LOGIN_ACCOUNT_SPECS are required.");
}

const accountSpecs = JSON.parse(accountSpecsJson);
if (!Array.isArray(accountSpecs) || accountSpecs.length === 0) {
  throw new Error("LOGIN_ACCOUNT_SPECS must be a non-empty JSON array.");
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

const pool = new pg.Pool({
  connectionString,
  ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
    ? undefined
    : { rejectUnauthorized: false },
});

try {
  // Older deployments predate the tenants.status column. The tenant that
  // already owns the existing local-account is always preferred.
  const tenant = await pool.query(
    `SELECT t.id
       FROM tenants t
      WHERE EXISTS (SELECT 1 FROM users u WHERE u.tenant_id = t.id)
      ORDER BY t.created_at NULLS LAST
      LIMIT 1`,
  );
  if (!tenant.rows[0]?.id) throw new Error("No active tenant is available for account provisioning.");

  for (const spec of accountSpecs) {
    if (!spec?.username || !spec?.password || !spec?.role || !spec?.displayName || !spec?.email) {
      throw new Error("Every account spec needs username, password, role, displayName, and email.");
    }
    const passwordHash = await hashPassword(spec.password);
    const existing = await pool.query(
      "SELECT id FROM users WHERE lower(username) = lower($1) LIMIT 1",
      [spec.username],
    );

    if (existing.rows[0]?.id) {
      await pool.query(
        `UPDATE users
            SET password_hash = $1, status = 'active', active = true,
                login_attempts = 0, locked_until = NULL, must_change_password = false,
                password_changed_at = now(), updated_at = now()
          WHERE id = $2`,
        [passwordHash, existing.rows[0].id],
      );
      console.log(JSON.stringify({ username: spec.username, action: "password_reset_and_unlocked" }));
    } else {
      await pool.query(
        `INSERT INTO users (
          tenant_id, identity_subject, display_name, active, username, email,
          password_hash, role, status, login_attempts, must_change_password,
          password_changed_at, created_at, updated_at
        ) VALUES ($1, $2, $3, true, $4, $5, $6, $7::user_role, 'active', 0, false, now(), now(), now())`,
        [tenant.rows[0].id, `user-${spec.username.toLowerCase()}`, spec.displayName,
          spec.username, spec.email, passwordHash, spec.role],
      );
      console.log(JSON.stringify({ username: spec.username, action: "created_and_activated" }));
    }
  }
} finally {
  await pool.end();
}
