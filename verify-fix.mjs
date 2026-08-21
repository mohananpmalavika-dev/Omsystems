#!/usr/bin/env node
import pg from 'pg';
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

async function verifyFix() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 VERIFICATION REPORT\n');
    console.log('='.repeat(60));
    
    // 1. Check edge agent in database
    console.log('\n1️⃣ EDGE AGENT STATUS:');
    const agents = await client.query(
      `SELECT id, name, status, credential_hash, credential_issued_at, credential_revoked_at 
       FROM edge_agents 
       WHERE name = 'MALAVIKA Scanner'`
    );
    
    if (agents.rows.length === 0) {
      console.log('   ❌ No MALAVIKA Scanner found in database');
      return;
    }
    
    const agent = agents.rows[0];
    console.log(`   Agent: ${agent.name}`);
    console.log(`   ID: ${agent.id}`);
    console.log(`   Status: ${agent.status}`);
    console.log(`   Credential: ${agent.credential_hash ? '✓ SET' : '✗ MISSING'}`);
    console.log(`   Issued: ${agent.credential_issued_at || 'never'}`);
    console.log(`   Revoked: ${agent.credential_revoked_at || 'no'}`);
    
    // 2. Verify token file matches database
    console.log('\n2️⃣ TOKEN VERIFICATION:');
    const token = await readFile('.scanner-runtime/edge-agent-token.txt', 'utf8');
    const tokenHash = createHash('sha256').update(token.trim()).digest();
    
    const hashesMatch = agent.credential_hash && 
      Buffer.compare(agent.credential_hash, tokenHash) === 0;
    
    console.log(`   Token file exists: ✓`);
    console.log(`   Token matches database: ${hashesMatch ? '✓' : '✗'}`);
    
    if (!hashesMatch) {
      console.log('   ⚠️  WARNING: Token file does not match database!');
    }
    
    // 3. Check camera assignments
    console.log('\n3️⃣ CAMERA ASSIGNMENTS:');
    const cameraCount = await client.query(
      `SELECT COUNT(*) as count FROM cameras WHERE edge_agent_id = $1`,
      [agent.id]
    );
    
    console.log(`   Cameras assigned: ${cameraCount.rows[0].count}`);
    
    // 4. Check camera status
    const cameraStatus = await client.query(
      `SELECT status, COUNT(*) as count 
       FROM cameras 
       WHERE edge_agent_id = $1 
       GROUP BY status`,
      [agent.id]
    );
    
    if (cameraStatus.rows.length > 0) {
      console.log('   Camera status breakdown:');
      for (const row of cameraStatus.rows) {
        console.log(`      ${row.status}: ${row.count}`);
      }
    }
    
    // 5. Summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 SUMMARY:');
    
    const allGood = agent.credential_hash && 
                    !agent.credential_revoked_at &&
                    hashesMatch &&
                    cameraCount.rows[0].count > 0;
    
    if (allGood) {
      console.log('✅ DATABASE CONFIGURATION IS CORRECT');
      console.log('\n🔧 NEXT STEP:');
      console.log('   The edge agent process needs to restart to pick up the new token.');
      console.log('   You may need to:');
      console.log('   1. Find the edge agent process (check Task Manager or Task Scheduler)');
      console.log('   2. Restart the process');
      console.log('   3. OR just wait - the edge agent may reload automatically');
      console.log('   4. Refresh your browser once the edge agent reconnects');
    } else {
      console.log('❌ CONFIGURATION ISSUES DETECTED');
      console.log('   Review the details above');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

verifyFix().catch(console.error);
