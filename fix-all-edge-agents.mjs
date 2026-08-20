#!/usr/bin/env node
import { randomBytes, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 
    'postgresql://aditivision_4gc4_user:vVZ8yzf7dRV7VIyOeQ6MmSQR9nHMifqa@dpg-da37mgbncjis73c09tpg-a.oregon-postgres.render.com/aditivision_4gc4',
  ssl: { rejectUnauthorized: false }
});

async function fixAllEdgeAgents() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Finding all edge agents...\n');
    
    const agents = await client.query(
      `SELECT id, name, status, credential_hash FROM edge_agents ORDER BY created_at DESC`
    );
    
    console.log(`Found ${agents.rows.length} edge agent(s)\n`);
    
    // Use the MALAVIKA Scanner agent
    const malavikaAgent = agents.rows.find(a => a.name === 'MALAVIKA Scanner');
    
    if (!malavikaAgent) {
      console.error('❌ MALAVIKA Scanner not found!');
      return;
    }
    
    console.log(`✅ Using edge agent: ${malavikaAgent.name} (${malavikaAgent.id})\n`);
    
    // Generate new credential
    const newToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(newToken).digest();
    
    // Update the credential
    await client.query(
      `UPDATE edge_agents 
       SET credential_hash = $1,
           credential_issued_at = NOW(),
           credential_revoked_at = NULL,
           status = 'online',
           last_seen_at = NOW()
       WHERE id = $2`,
      [tokenHash, malavikaAgent.id]
    );
    
    console.log('✅ Updated edge agent credentials');
    
    // Save the token
    await writeFile('.scanner-runtime/edge-agent-token.txt', newToken, 'utf8');
    console.log('💾 Token saved to .scanner-runtime/edge-agent-token.txt\n');
    
    // Assign ALL cameras to this edge agent
    const updateCameras = await client.query(
      `UPDATE cameras 
       SET edge_agent_id = $1 
       WHERE edge_agent_id IS NULL OR edge_agent_id != $1
       RETURNING id`,
      [malavikaAgent.id]
    );
    
    console.log(`📹 Updated ${updateCameras.rowCount} camera(s) to use this edge agent\n`);
    
    // Get camera count
    const cameraCount = await client.query(
      `SELECT COUNT(*) as count FROM cameras WHERE edge_agent_id = $1`,
      [malavikaAgent.id]
    );
    
    console.log(`📊 Total cameras assigned to this edge agent: ${cameraCount.rows[0].count}\n`);
    
    // Show camera details
    console.log('📹 Camera assignments:');
    const cameras = await client.query(
      `SELECT c.id, n.name, c.status, c.edge_agent_id
       FROM cameras c
       LEFT JOIN nodes n ON c.resource_node_id = n.id
       WHERE c.edge_agent_id = $1
       ORDER BY n.name
       LIMIT 20`,
      [malavikaAgent.id]
    );
    
    for (const cam of cameras.rows) {
      console.log(`   ✓ ${cam.name || 'Unnamed'} - ${cam.status}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ AUTHENTICATION FIX COMPLETE');
    console.log('='.repeat(60));
    console.log(`Edge Agent: ${malavikaAgent.name}`);
    console.log(`Agent ID: ${malavikaAgent.id}`);
    console.log(`Token saved: .scanner-runtime/edge-agent-token.txt`);
    console.log(`Cameras assigned: ${cameraCount.rows[0].count}`);
    console.log('\nNEXT STEPS:');
    console.log('1. Copy the token to your .env file as EDGE_AGENT_TOKEN');
    console.log('2. Restart the edge agent process');
    console.log('3. Refresh the browser page');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixAllEdgeAgents().catch(console.error);
