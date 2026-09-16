#!/usr/bin/env node
import pg from 'pg';
import { config } from 'dotenv';

config();
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const searchTerm = process.argv[2] || 'dhanya';

try {
  const result = await pool.query(`
    SELECT 
      id, 
      username, 
      email, 
      status, 
      role,
      (preferences->'faceVerification') IS NOT NULL as has_face,
      (preferences->'faceVerification'->>'version') as face_version,
      jsonb_array_length(COALESCE(preferences->'faceVerification'->'templates', '[]'::jsonb)) as template_count,
      created_at
    FROM users 
    WHERE LOWER(username) LIKE LOWER($1) 
       OR LOWER(email) LIKE LOWER($1)
    ORDER BY created_at DESC
  `, [`%${searchTerm}%`]);
  
  if (result.rows.length === 0) {
    console.log(`\n❌ No users found matching: "${searchTerm}"\n`);
    console.log('All users in database:');
    const all = await pool.query(`
      SELECT username, email, status,
             (preferences->'faceVerification') IS NOT NULL as has_face
      FROM users ORDER BY created_at DESC LIMIT 20
    `);
    console.table(all.rows);
  } else {
    console.log(`\n✅ Found ${result.rows.length} user(s) matching "${searchTerm}":\n`);
    console.table(result.rows);
  }
} catch (error) {
  console.error('Error:', error.message);
} finally {
  await pool.end();
}
