#!/usr/bin/env node
import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';

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
