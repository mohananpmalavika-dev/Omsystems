#!/usr/bin/env node
import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const SCANNER_ID = '6a570d4a-2c71-415f-b59a-643cf50d55c5';

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

const result = await client.query(
  'SELECT id, name, status FROM edge_agents WHERE id = $1',
  [SCANNER_ID]
);

console.log('\n📋 Scanner Status:\n');
if (result.rows.length === 0) {
  console.log('❌ Scanner NOT found in database!');
  console.log('   ID:', SCANNER_ID);
  console.log('\n💡 The scanner was deleted. Run SETUP_AND_START_SCANNER.bat again.\n');
} else {
  console.log('✅ Scanner exists:');
  console.log('   ID:', result.rows[0].id);
  console.log('   Name:', result.rows[0].name);
  console.log('   Status:', result.rows[0].status);
  console.log('\n✅ Scanner is registered! The startup should work.\n');
}

await client.end();
