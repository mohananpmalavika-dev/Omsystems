/**
 * Run Incident Migration
 * 
 * Executes the incidents table migration.
 * 
 * Usage:
 *   npm run migrate:incidents
 *   or
 *   tsx backend/scripts/run-incident-migration.ts
 */

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('render.com') || DATABASE_URL.includes('heroku.com')
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    console.log('🔄 Connecting to database...');
    await pool.query('SELECT 1');
    console.log('✅ Connected to database');

    // Read migration file
    const migrationPath = join(
      __dirname,
      '..',
      'src',
      'database',
      'migrations',
      '20260811_create_incidents_table.sql'
    );

    console.log('📄 Reading migration file:', migrationPath);
    const migrationSQL = readFileSync(migrationPath, 'utf8');

    console.log('🔄 Executing migration...');
    await pool.query(migrationSQL);

    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('Created:');
    console.log('  - incidents table');
    console.log('  - incident_alerts table');
    console.log('  - incident_status enum');
    console.log('  - incident_severity enum');
    console.log('  - incident_type enum');
    console.log('  - Multiple performance indexes');
    console.log('  - Triggers for updated_at');

    // Verify tables exist
    console.log('');
    console.log('🔍 Verifying tables...');
    
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('incidents', 'incident_alerts')
      ORDER BY table_name
    `);

    console.log(`✅ Found ${tablesResult.rows.length} tables:`);
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    // Verify indexes
    const indexesResult = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename IN ('incidents', 'incident_alerts')
      AND schemaname = 'public'
      ORDER BY indexname
    `);

    console.log(`✅ Created ${indexesResult.rows.length} indexes:`);
    indexesResult.rows.forEach(row => {
      console.log(`  - ${row.indexname}`);
    });

  } catch (error) {
    console.error('❌ Migration failed:', error);
    
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      
      // Check for common errors
      if (error.message.includes('already exists')) {
        console.log('');
        console.log('ℹ️  Tables may already exist. To re-run migration:');
        console.log('   1. Drop existing tables: DROP TABLE incidents CASCADE;');
        console.log('   2. Run this script again');
      }
    }
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
runMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
