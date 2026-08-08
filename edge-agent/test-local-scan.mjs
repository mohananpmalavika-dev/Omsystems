#!/usr/bin/env node

/**
 * Local Camera Scanner Test
 * Scans your network for cameras without connecting to control plane
 */

import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL || 
  'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';

const BRANCH_ID = '00000000-0000-4000-8000-000000000104';
const EDGE_AGENT_ID = '6a570d4a-2c71-415f-b59a-643cf50d55c5';

console.log('🔍 Local Camera Scanner Test\n');
console.log('📋 Configuration:');
console.log(`   Branch ID: ${BRANCH_ID}`);
console.log(`   Agent ID: ${EDGE_AGENT_ID}`);
console.log(`   Database: Connected\n`);

// Connect to database
const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();
console.log('✅ Database connected!\n');

// Fetch credentials from database
const result = await client.query(
  `SELECT username, password, ip_address, updated_at 
   FROM camera_credentials 
   WHERE branch_id = $1 AND edge_agent_id = $2
   ORDER BY ip_address NULLS LAST`,
  [BRANCH_ID, EDGE_AGENT_ID]
);

console.log(`📦 Found ${result.rows.length} credential(s) in database:\n`);

for (const row of result.rows) {
  console.log(`   ${row.ip_address || 'default'}: ${row.username} / ${row.password.replace(/./g, '*')}`);
}

await client.end();

console.log('\n💡 Next Steps:');
console.log('1. Get the EDGE_BRIDGE_SHARED_KEY from your Render dashboard:');
console.log('   https://dashboard.render.com');
console.log('   → Open "sentinel-grid-control-plane1" service');
console.log('   → Click "Environment" tab');
console.log('   → Copy EDGE_BRIDGE_SHARED_KEY value');
console.log('');
console.log('2. Update c:\\Omsystems\\edge-agent\\.env:');
console.log('   EDGE_BRIDGE_SHARED_KEY=<paste-the-key-here>');
console.log('');
console.log('3. Run the scanner:');
console.log('   npm run dev');
console.log('');
console.log('✅ Database credentials are ready - just need the authentication key!');
