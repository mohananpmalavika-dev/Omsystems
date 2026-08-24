#!/usr/bin/env node

import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

async function checkStatus() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  });

  try {
    await client.connect();
    
    const cameras = await client.query('SELECT COUNT(*) FROM cameras');
    const agents = await client.query('SELECT COUNT(*) FROM edge_agents');
    const branches = await client.query('SELECT COUNT(*) FROM branches');
    
    console.log(`cameras: ${cameras.rows[0].count}`);
    console.log(`edge_agents: ${agents.rows[0].count}`);
    console.log(`branches: ${branches.rows[0].count}`);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

checkStatus();
