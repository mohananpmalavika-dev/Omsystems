#!/usr/bin/env node
import pkg from 'pg';
const { Pool } = pkg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

async function checkTenant() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Checking tenants...\n');

    const result = await pool.query(`
      SELECT id, name, slug 
      FROM tenants 
      ORDER BY created_at
    `);

    console.log('Found', result.rows.length, 'tenant(s):\n');
    result.rows.forEach(t => {
      console.log(`  ID: ${t.id}`);
      console.log(`  Name: ${t.name}`);
      console.log(`  Slug: ${t.slug || '(null)'}`);
      console.log('');
    });

    console.log('\nChecking user with tenant...\n');
    const userResult = await pool.query(`
      SELECT u.id, u.username, u.tenant_id, t.name as tenant_name, t.slug as tenant_slug
      FROM users u
      JOIN tenants t ON t.id = u.tenant_id
      WHERE u.username = 'mgdhanyamohan'
    `);

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      console.log('User details:');
      console.log(`  Username: ${user.username}`);
      console.log(`  Tenant ID: ${user.tenant_id}`);
      console.log(`  Tenant Name: ${user.tenant_name}`);
      console.log(`  Tenant Slug: ${user.tenant_slug || '(null)'}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkTenant();
