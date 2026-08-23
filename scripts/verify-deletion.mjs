#!/usr/bin/env node

import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = 'postgresql://aditivision_4gc4_user:vVZ8yzf7dRV7VIyOeQ6MmSQR9nHMifqa@dpg-da37mgbncjis73c09tpg-a.oregon-postgres.render.com/aditivision_4gc4';

async function verifyDeletion() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
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
