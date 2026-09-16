#!/usr/bin/env node
import pg from 'pg';
import { config } from 'dotenv';

config();
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

try {
  const result = await pool.query(`
    SELECT id, username, email, status, role, 
           (preferences->'faceVerification') IS NOT NULL as has_face
    FROM users 
    ORDER BY created_at DESC 
    LIMIT 50
  `);
  
  console.log('\n📋 All Users in Database:\n');
  console.table(result.rows);
  console.log(`\nTotal: ${result.rows.length} users`);
} catch (error) {
  console.error('Error:', error.message);
} finally {
  await pool.end();
}
