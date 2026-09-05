#!/usr/bin/env node

import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required.");
  process.exit(1);
}

async function verifyDeletion() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' || DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected successfully!\n');

    console.log('📊 Current database status:\n');

    const tables = ['cameras', 'edge_agents', 'branches'];
    
    for (const table of tables) {
      const countResult = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
      const count = countResult.rows[0].count;
      const emoji = count === '0' ? '✅' : '⚠️';
      console.log(`${emoji} ${table}: ${count} records`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

verifyDeletion();
