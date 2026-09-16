#!/usr/bin/env node
/**
 * Check for user "dhanya" in different databases
 */

import pg from 'pg';
import { config } from 'dotenv';

config();

const { Pool } = pg;

const databases = [
  {
    name: "Main Database (.env)",
    url: process.env.DATABASE_URL
  },
  {
    name: "Edge Agent Database",
    url: "postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej"
  }
];

async function checkDatabase(dbName, dbUrl) {
  console.log(`\n🔍 Checking: ${dbName}`);
  console.log(`   URL: ${dbUrl?.substring(0, 30)}...`);
  
  if (!dbUrl) {
    console.log('   ❌ No connection string');
    return;
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 30000
  });

  try {
    console.log('   ⏳ Connecting (30s timeout)...');
    
    // Test connection first
    const testConn = await pool.query('SELECT NOW()');
    console.log(`   ✅ Connected! Server time: ${testConn.rows[0].now}`);
    
    // Check if users table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'users'
      );
    `);

    if (!tableCheck.rows[0]?.exists) {
      console.log('   ⚠️  No "users" table found');
      await pool.end();
      return;
    }

    // Search for user "dhanya"
    const result = await pool.query(`
      SELECT 
        id, 
        username, 
        email, 
        status, 
        role,
        (preferences->'faceVerification') IS NOT NULL as has_face_enrolled,
        (preferences->'faceVerification'->>'version') as face_version,
        (preferences->'faceVerification'->>'enrolledAt') as enrolled_at,
        jsonb_array_length(COALESCE(preferences->'faceVerification'->'templates', '[]'::jsonb)) as template_count
      FROM users 
      WHERE LOWER(username) = 'dhanya' 
         OR LOWER(email) LIKE '%dhanya%'
         OR username ILIKE '%dhanya%'
    `);

    if (result.rows.length === 0) {
      console.log('   ❌ User "dhanya" NOT FOUND');
      
      // Show all users for reference
      const allUsers = await pool.query(`
        SELECT username, email, status, 
               (preferences->'faceVerification') IS NOT NULL as has_face
        FROM users 
        ORDER BY created_at DESC 
        LIMIT 10
      `);
      
      console.log('\n   📋 Sample users in this database:');
      allUsers.rows.forEach(u => {
        console.log(`      - ${u.username} (${u.email || 'no email'}) [Face: ${u.has_face ? '✅' : '❌'}]`);
      });
    } else {
      console.log('   ✅ FOUND USER "dhanya"!\n');
      result.rows.forEach(user => {
        console.log('   👤 User Details:');
        console.log(`      ID: ${user.id}`);
        console.log(`      Username: ${user.username}`);
        console.log(`      Email: ${user.email || 'N/A'}`);
        console.log(`      Status: ${user.status}`);
        console.log(`      Role: ${user.role}`);
        console.log(`      Face Enrolled: ${user.has_face_enrolled ? '✅ YES' : '❌ NO'}`);
        if (user.has_face_enrolled) {
          console.log(`      Face Version: ${user.face_version || 'legacy'}`);
          console.log(`      Template Count: ${user.template_count || 1}`);
          console.log(`      Enrolled At: ${user.enrolled_at || 'unknown'}`);
        }
      });
    }

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    if (error.message.includes('timeout')) {
      console.log('   💡 Firewall may be blocking connection');
      console.log('   💡 Or GCP Cloud SQL requires authorized networks');
    }
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log('🔍 Searching for user "dhanya" across databases...');
  console.log('='.repeat(60));

  for (const db of databases) {
    await checkDatabase(db.name, db.url);
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n💡 If user "dhanya" not found, they may be in:');
  console.log('   1. A different GCP Cloud SQL database');
  console.log('   2. A local development database');
  console.log('   3. Another environment (staging/production)');
  console.log('\n📝 To find GCP database:');
  console.log('   - Check GCP Console → SQL → Instances');
  console.log('   - Check deployment configs (docker-compose, k8s)');
  console.log('   - Check CI/CD environment variables');
  console.log('   - Ask team members for connection string');
}

main();
