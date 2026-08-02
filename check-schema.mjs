#!/usr/bin/env node
import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

// Get edge_agents table schema
const schema = await client.query(`
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'edge_agents'
  ORDER BY ordinal_position
`);

console.log('edge_agents table columns:');
schema.rows.forEach(row => {
  console.log(`  ${row.column_name}: ${row.data_type}`);
});

await client.end();
