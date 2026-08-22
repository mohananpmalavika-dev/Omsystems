#!/usr/bin/env node
/**
 * Camera Credential Management Web Application
 * Full-featured server with REST API + Web UI
 */

import express from 'express';
import pg from 'pg';
import multer from 'multer';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ===== API ENDPOINTS =====

// Get all credentials with pagination and filtering
app.get('/api/credentials', async (req, res) => {
  const { branch_id, search, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `
      SELECT 
        id, branch_id, edge_agent_id, ip_address, 
        username, scope, created_at, updated_at
      FROM camera_credentials
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (branch_id) {
      paramCount++;
      query += ` AND branch_id = $${paramCount}`;
      params.push(branch_id);
    }

    if (search) {
      paramCount++;
      query += ` AND (ip_address ILIKE $${paramCount} OR username ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM camera_credentials WHERE 1=1';
    const countParams = [];
    let countParamNum = 0;

    if (branch_id) {
      countParamNum++;
      countQuery += ` AND branch_id = $${countParamNum}`;
      countParams.push(branch_id);
    }

    if (search) {
      countParamNum++;
      countQuery += ` AND (ip_address ILIKE $${countParamNum} OR username ILIKE $${countParamNum})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      credentials: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching credentials:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get unique branches
app.get('/api/branches', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT branch_id, COUNT(*) as credential_count
      FROM camera_credentials
      GROUP BY branch_id
      ORDER BY branch_id
    `);
    res.json({ branches: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add single credential
app.post('/api/credentials', async (req, res) => {
  const { branch_id, edge_agent_id, ip_address, username, password } = req.body;

  if (!branch_id || !username || !password) {
    return res.status(400).json({ 
      error: 'branch_id, username, and password are required' 
    });
  }

  try {
    const result = await pool.query(`
      INSERT INTO camera_credentials (
        branch_id, edge_agent_id, ip_address, username, password, scope
      ) VALUES ($1, $2, $3, $4, $5, $6)
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
    console.error('Error creating credential:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update credential
app.put('/api/credentials/:id', async (req, res) => {
  const { id } = req.params;
  const { username, password, ip_address } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  try {
    const result = await pool.query(`
      UPDATE camera_credentials 
      SET username = $1, password = $2, ip_address = $3, 
          scope = $4, updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [username, password, ip_address || null, ip_address ? 'host-specific' : 'default', id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    res.json({ success: true, credential: result.rows[0] });
  } catch (error) {
    console.error('Error updating credential:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete credential
app.delete('/api/credentials/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM camera_credentials WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    res.json({ success: true, deleted: id });
  } catch (error) {
    console.error('Error deleting credential:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk upload CSV
app.post('/api/credentials/bulk', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const csvContent = readFileSync(req.file.path, 'utf-8');
    const lines = csvContent.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    const results = {
      imported: 0,
      failed: 0,
      errors: []
    };

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const record = {};

        headers.forEach((header, index) => {
          record[header] = values[index] || null;
        });

        try {
          await client.query(`
            INSERT INTO camera_credentials (
              branch_id, edge_agent_id, ip_address, username, password, scope
            ) VALUES ($1, $2, $3, $4, $5, $6)
          `, [
            record.branch_id,
            record.edge_agent_id || null,
            record.ip_address || null,
            record.username,
            record.password,
            record.ip_address ? 'host-specific' : 'default'
          ]);

          results.imported++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            line: i + 1,
            data: record,
            error: error.message
          });
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      total: lines.length - 1,
      ...results
    });
  } catch (error) {
    console.error('Error processing bulk upload:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download CSV template
app.get('/api/template/csv', (req, res) => {
  const template = 'branch_id,edge_agent_id,ip_address,username,password,location_name\n' +
                   '00000000-0000-4000-8000-000000000104,6a570d4a-2c71-415f-b59a-643cf50d55c5,,admin,password123,Branch-Default\n' +
                   '00000000-0000-4000-8000-000000000104,6a570d4a-2c71-415f-b59a-643cf50d55c5,192.168.1.10,admin,password123,Camera-01';
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=credential-template.csv');
  res.send(template);
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_credentials,
        COUNT(DISTINCT branch_id) as total_branches,
        COUNT(CASE WHEN ip_address IS NOT NULL THEN 1 END) as host_specific,
        COUNT(CASE WHEN ip_address IS NULL THEN 1 END) as default_credentials
      FROM camera_credentials
    `);

    res.json(stats.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'camera-credential-manager' });
});

// Serve the frontend
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n🚀 Camera Credential Manager');
  console.log(`📡 Web UI: http://localhost:${PORT}`);
  console.log(`📊 API Docs: http://localhost:${PORT}/api/health`);
  console.log(`\n✨ Features:`);
  console.log(`   ✅ Add individual credentials`);
  console.log(`   ✅ Bulk CSV upload`);
  console.log(`   ✅ Edit & Delete credentials`);
  console.log(`   ✅ Search & Filter by branch`);
  console.log(`   ✅ Real-time statistics\n`);
});
