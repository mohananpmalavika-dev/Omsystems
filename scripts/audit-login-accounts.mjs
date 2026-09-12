import pg from "pg";

const usernames = process.argv.slice(2).map((username) => username.trim()).filter(Boolean);
if (usernames.length === 0) {
  throw new Error("Pass one or more usernames as arguments.");
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const pool = new pg.Pool({
  connectionString,
  ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
    ? undefined
    : { rejectUnauthorized: false },
});

try {
  const result = await pool.query(
    `SELECT username, status, active, role, login_attempts, locked_until,
            CASE
              WHEN password_hash LIKE 'scrypt$%' THEN 'scrypt'
              WHEN password_hash ~ '^\\$2[aby]\\$' THEN 'bcrypt'
              WHEN password_hash IS NULL OR password_hash = '' THEN 'missing'
              ELSE 'unsupported'
            END AS password_hash_algorithm
       FROM users
       WHERE lower(username) = ANY($1::text[])
       ORDER BY lower(username)`,
    [usernames.map((username) => username.toLowerCase())],
  );

  const found = new Set(result.rows.map((row) => row.username.toLowerCase()));
  for (const row of result.rows) {
    console.log(JSON.stringify({
      username: row.username,
      status: row.status,
      active: row.active,
      role: row.role,
      loginAttempts: row.login_attempts,
      lockedUntil: row.locked_until,
      passwordHashAlgorithm: row.password_hash_algorithm,
    }));
  }
  for (const username of usernames) {
    if (!found.has(username.toLowerCase())) console.log(JSON.stringify({ username, state: "not_found" }));
  }
} finally {
  await pool.end();
}
