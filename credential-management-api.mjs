#!/usr/bin/env node
/**
 * Camera Credential Management API
 * For centralized management of 400+ locations
 * 
 * Endpoints:
 * POST /api/credentials - Add/Update credentials
 * GET /api/credentials/:branch_id - Get credentials for a branch
 * DELETE /api/credentials/:id - Delete credential
 */

import express from 'express';
import pg from 'pg';

const { Client } = pg;
const app = express();
app.use(express.json());

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

// Add/Update camera credentials
app.post('/api/credentials', async (req, res) => {
  const { branch_id, edge_agent_id, ip_address, username, password } = req.body;
  
  if (!branch_id || !username || !password) {
    return res.status(400).json({ error: 'branch_id, username, and password are required' });
  }

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    const result = await client.query(`
      INSERT INTO camera_credentials (branch_id, edge_agent_id, ip_address, username, password, scope)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at
    `, [
      branch_id,
      edge_agent_id || null,
      ip_address || null,
      username,
      password,
      ip_address ? 'host-specific' : 'default'
    ]);

    res.json({
      success: true,
      id: result.rows[0].id,
      created_at: result.rows[0].created_at
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
});

// Get credentials for a branch
app.get('/api/credentials/:branch_id', async (req, res) => {
  const { branch_id } = req.params;

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT id, branch_id, edge_agent_id, ip_address, username, scope, created_at, updated_at
      FROM camera_credentials
      WHERE branch_id = $1
      ORDER BY 
        CASE 
          WHEN ip_address IS NOT NULL THEN 1
          ELSE 2
        END, created_at DESC
    `, [branch_id]);

    res.json({
      branch_id,
      credentials: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
});

// Delete credential
app.delete('/api/credentials/:id', async (req, res) => {
  const { id } = req.params;

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    await client.query('DELETE FROM camera_credentials WHERE id = $1', [id]);

    res.json({ success: true, deleted: id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'camera-credential-api' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 Camera Credential Management API`);
  console.log(`📡 Running on http://localhost:${PORT}`);
  console.log(`\n📋 Endpoints:`);
  console.log(`   POST   /api/credentials - Add credentials`);
  console.log(`   GET    /api/credentials/:branch_id - Get credentials`);
  console.log(`   DELETE /api/credentials/:id - Delete credential`);
  console.log(`   GET    /health - Health check\n`);
});
