#!/usr/bin/env node
/**
 * Create PostgreSQL Superuser
 */

import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';
const username = 'mgdhanyamohan';
const password = 'Thathu110';

async function createSuperuser() {
  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('✅ Connected successfully');

    // Check if user already exists
    console.log(`\nChecking if user '${username}' exists...`);
    const checkResult = await client.query(
      `SELECT 1 FROM pg_roles WHERE rolname = $1`,
      [username]
    );

    if (checkResult.rows.length > 0) {
      console.log(`⚠️  User '${username}' already exists`);
      console.log('Updating password and granting privileges...');
      
      await client.query(`ALTER USER ${username} WITH PASSWORD '${password}'`);
      console.log('✅ User password updated');
    } else {
      console.log(`Creating user '${username}' (with maximum available privileges)...`);
      
      // Create user with CREATEDB and CREATEROLE (no SUPERUSER on Render)
      await client.query(`CREATE USER ${username} WITH CREATEDB CREATEROLE LOGIN PASSWORD '${password}'`);
      console.log('✅ User created successfully');
    }

    // Grant all privileges on database
    console.log('\nGranting database privileges...');
    await client.query(`GRANT ALL PRIVILEGES ON DATABASE omcamera_y1ej TO ${username}`);
    console.log('✅ Database privileges granted');

    // Grant schema privileges
    console.log('Granting schema privileges...');
    await client.query(`GRANT ALL PRIVILEGES ON SCHEMA public TO ${username}`);
    console.log('✅ Schema privileges granted');

    // Grant table privileges
    console.log('Granting table privileges...');
    await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${username}`);
    console.log('✅ Table privileges granted');

    // Grant sequence privileges
    console.log('Granting sequence privileges...');
    await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${username}`);
    console.log('✅ Sequence privileges granted');

    // Set default privileges for future objects
    console.log('Setting default privileges...');
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${username}`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${username}`);
    console.log('✅ Default privileges set');

    // Verify superuser status
    console.log('\nVerifying superuser status...');
    const verifyResult = await client.query(
      `SELECT rolname, rolsuper, rolcreaterole, rolcreatedb 
       FROM pg_roles 
       WHERE rolname = $1`,
      [username]
    );

    const user = verifyResult.rows[0];
    console.log('\nUser details:');
    console.log(`  Username: ${user.rolname}`);
    console.log(`  Superuser: ${user.rolsuper ? '✅ Yes' : '⚠️  No (limited by Render)'}`);
    console.log(`  Can create roles: ${user.rolcreaterole ? '✅ Yes' : '❌ No'}`);
    console.log(`  Can create databases: ${user.rolcreatedb ? '✅ Yes' : '❌ No'}`);

    console.log('\n🎉 User setup complete!');
    console.log('\n📝 Note: Render PostgreSQL does not allow true SUPERUSER privileges for security.');
    console.log('   This user has maximum available privileges (CREATEDB, CREATEROLE, and full database access).');
    console.log('\nConnection details:');
    console.log(`  Username: ${username}`);
    console.log(`  Password: ${password}`);
    console.log(`  Database: omcamera_y1ej`);
    console.log(`  Host: dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com`);
    console.log('\nConnection string:');
    console.log(`  postgresql://${username}:${password}@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code) {
      console.error(`   Error Code: ${error.code}`);
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n✅ Disconnected from database');
  }
}

createSuperuser();
