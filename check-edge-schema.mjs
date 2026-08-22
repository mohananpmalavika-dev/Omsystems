#!/usr/bin/env node
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
  const client = await pool.connect();
  
  try {
    console.log('📋 Edge Agents Table Schema:');
    const schema = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'edge_agents'
      ORDER BY ordinal_position
    `);
    
    for (const col of schema.rows) {
      console.log(`   ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    }
    
    console.log('\n📋 Current Edge Agents:');
    const agents = await client.query(`SELECT * FROM edge_agents LIMIT 5`);
    console.log(agents.rows);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkSchema().catch(console.error);
