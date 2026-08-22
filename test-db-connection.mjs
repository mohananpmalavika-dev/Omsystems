#!/usr/bin/env node
import pg from 'pg';
const { Pool } = pg;

const databaseUrl = process.argv[2];
console.log('Testing connection to:', databaseUrl.replace(/postgresql:\/\/[^@]+@/, 'postgresql://***:***@'));

const pool = new Pool({ 
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

try {
  const result = await pool.query('SELECT NOW()');
  console.log('✅ Connected successfully at:', result.rows[0].now);
  
  const edgeCount = await pool.query('SELECT COUNT(*) FROM edge_agents');
  const cameraCount = await pool.query('SELECT COUNT(*) FROM cameras');
  
  console.log('Edge Agents:', edgeCount.rows[0].count);
  console.log('Cameras:', cameraCount.rows[0].count);
} catch (error) {
  console.error('❌ Error:', error.message);
} finally {
  await pool.end();
}
