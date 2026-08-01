#!/usr/bin/env node
import pkg from 'pg';
const { Client } = pkg;

const DATABASE_URL = 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';

async function checkTables() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    // List all tables
    const tables = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    
    console.log('📋 Available tables:\n');
    tables.rows.forEach(row => {
      console.log(`  - ${row.tablename}`);
    });
    
    // Look for telemetry-related tables
    console.log('\n\n🔍 Telemetry-related tables:');
    const telemetryTables = tables.rows.filter(row => 
      row.tablename.includes('telemetry') || 
      row.tablename.includes('metric') ||
      row.tablename.includes('health')
    );
    
    telemetryTables.forEach(row => {
      console.log(`  - ${row.tablename}`);
    });
    
  } catch (error) {
    console.error('ERROR:', error.message);
  } finally {
    await client.end();
  }
}

checkTables();
