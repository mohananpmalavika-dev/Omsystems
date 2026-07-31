const { Pool } = require('pg');
(async () => {
  const pool = new Pool({
    connectionString: 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej',
    ssl: { rejectUnauthorized: false }
  });
  try {
    const update = await pool.query(
      `UPDATE users SET login_attempts = 0, locked_until = NULL WHERE LOWER(username) = LOWER($1) RETURNING id, username, status, login_attempts, locked_until`,
      ['mgdhanyamohan']
    );
    console.log('Updated rows:', update.rowCount);
    console.log(JSON.stringify(update.rows, null, 2));
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
