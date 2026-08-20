#!/usr/bin/env node
import { randomBytes, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 
    'postgresql://aditivision_4gc4_user:vVZ8yzf7dRV7VIyOeQ6MmSQR9nHMifqa@dpg-da37mgbncjis73c09tpg-a.oregon-postgres.render.com/aditivision_4gc4',
  ssl: { rejectUnauthorized: false }
});

async function restoreEdgeAuthentication() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Finding MALAVIKA Scanner edge agent...');
    
    const agentResult = await client.query(
      `SELECT id, name, status FROM edge_agents WHERE name ILIKE '%MALAVIKA%' OR name ILIKE '%Scanner%' LIMIT 1`
    );
    
    if (agentResult.rows.length === 0) {
      console.error('❌ No edge agent found. Creating new one...');
      
      // Create new edge agent
      const newToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(newToken).digest();
      
      const createResult = await client.query(
        `INSERT INTO edge_agents (id, name, status, credential_hash, last_heartbeat)
         VALUES (gen_random_uuid(), 'MALAVIKA Scanner', 'online', $1, NOW())
         RETURNING id, name`,
        [tokenHash]
      );
      
      const agentId = createResult.rows[0].id;
      console.log(`✅ Created new edge agent: ${createResult.rows[0].name} (${agentId})`);
      
      // Save token
      await writeFile('.scanner-runtime/edge-agent-token.txt', newToken, 'utf8');
      console.log('💾 New token saved to .scanner-runtime/edge-agent-token.txt');
      
      // Assign cameras to new agent
      await client.query(
        `UPDATE cameras SET edge_agent_id = $1 WHERE edge_agent_id IS NULL OR status = 'online'`,
        [agentId]
      );
      
      const cameraCount = await client.query(
        `SELECT COUNT(*) as count FROM cameras WHERE edge_agent_id = $1`,
        [agentId]
      );
      
      console.log(`📹 Assigned ${cameraCount.rows[0].count} cameras to edge agent`);
      
      console.log('\n✅ NEW EDGE AGENT SETUP COMPLETE');
      console.log(`   Agent ID: ${agentId}`);
      console.log(`   Token saved to: .scanner-runtime/edge-agent-token.txt`);
      console.log(`   Copy this token to your .env file as EDGE_AGENT_TOKEN`);
      
    } else {
      const agent = agentResult.rows[0];
      console.log(`✅ Found edge agent: ${agent.name} (${agent.id})`);
      
      // Generate new token
      const newToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(newToken).digest();
      
      // Update agent credentials
      await client.query(
        `UPDATE edge_agents 
         SET credential_hash = $1, 
             status = 'online', 
             last_heartbeat = NOW()
         WHERE id = $2`,
        [tokenHash, agent.id]
      );
      
      console.log('✅ Updated edge agent credentials');
      
      // Save token
      await writeFile('.scanner-runtime/edge-agent-token.txt', newToken, 'utf8');
      console.log('💾 Token saved to .scanner-runtime/edge-agent-token.txt');
      
      // Assign all cameras to this agent
      const updateResult = await client.query(
        `UPDATE cameras SET edge_agent_id = $1 WHERE edge_agent_id IS NULL OR edge_agent_id = $1`,
        [agent.id]
      );
      
      const cameraCount = await client.query(
        `SELECT COUNT(*) as count FROM cameras WHERE edge_agent_id = $1`,
        [agent.id]
      );
      
      console.log(`📹 ${cameraCount.rows[0].count} cameras assigned to this edge agent`);
      
      console.log('\n✅ EDGE AUTHENTICATION RESTORED');
      console.log(`   Agent: ${agent.name} (${agent.id})`);
      console.log(`   Status: online`);
      console.log(`   Token: saved to .scanner-runtime/edge-agent-token.txt`);
    }
    
    // Show camera status
    console.log('\n📊 Current camera status:');
    const cameras = await client.query(
      `SELECT c.id, n.name, c.status, c.edge_agent_id
       FROM cameras c
       LEFT JOIN nodes n ON c.resource_node_id = n.id
       ORDER BY n.name LIMIT 15`
    );
    
    for (const cam of cameras.rows) {
      console.log(`   ${cam.name || 'Unnamed'}: ${cam.status} (agent: ${cam.edge_agent_id ? 'assigned' : 'none'})`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

restoreEdgeAuthentication().catch(console.error);
