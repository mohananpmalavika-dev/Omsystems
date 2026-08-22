#!/usr/bin/env node
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function checkTables() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('\n🔍 Checking database tables...\n');
    
    const tables = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    
    console.log(`Found ${tables.rows.length} tables:\n`);
    tables.rows.forEach(t => console.log(`  - ${t.tablename}`));
    
    // Try to find camera-related tables
    const cameraTables = tables.rows.filter(t => 
      t.tablename.includes('camera') || 
      t.tablename.includes('device') ||
      t.tablename.includes('discover')
    );
    
    console.log(`\n📹 Camera/Device related tables (${cameraTables.length}):\n`);
    for (const table of cameraTables) {
      const count = await pool.query(`SELECT COUNT(*) FROM ${table.tablename}`);
      console.log(`  ${table.tablename}: ${count.rows[0].count} rows`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkTables();
