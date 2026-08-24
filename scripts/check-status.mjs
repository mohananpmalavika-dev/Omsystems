#!/usr/bin/env node

import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = 'postgresql://aditivision_4gc4_user:vVZ8yzf7dRV7VIyOeQ6MmSQR9nHMifqa@dpg-da37mgbncjis73c09tpg-a.oregon-postgres.render.com/aditivision_4gc4';

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
