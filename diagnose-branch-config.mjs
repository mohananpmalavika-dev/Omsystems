#!/usr/bin/env node
/**
 * Diagnose Branch Download Configuration
 * This shows what data WOULD be embedded in a downloaded edge agent package
 */

import pkg from 'pg';
const { Client } = pkg;

const DATABASE_URL = 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';
const BRANCH_NAME = 'H1'; // Change this to match your branch

async function diagnoseConfig() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to database...\n');
    await client.connect();

    // 1. Find the branch
    console.log('📍 Step 1: Finding branch...');
    const branchResult = await client.query(`
      SELECT id, name, tenant_id, node_type
      FROM resource_nodes
      WHERE name ILIKE $1 AND node_type = 'branch'
      ORDER BY created_at DESC
      LIMIT 1
    `, [`%${BRANCH_NAME}%`]);

    if (branchResult.rows.length === 0) {
      console.log(`❌ No branch found matching "${BRANCH_NAME}"\n`);
      
      // Show available branches
      const allBranches = await client.query(`
        SELECT name, id
        FROM resource_nodes
        WHERE node_type = 'branch'
        ORDER BY name
        LIMIT 20
      `);
      
      if (allBranches.rows.length > 0) {
        console.log('Available branches:');
        allBranches.rows.forEach(b => console.log(`  - ${b.name} (${b.id})`));
      }
      return;
    }

    const branch = branchResult.rows[0];
    console.log(`✅ Found branch: ${branch.name}`);
    console.log(`   Branch ID: ${branch.id}`);
    console.log(`   Tenant ID: ${branch.tenant_id}\n`);

    // 2. Find edge agents for this branch
    console.log('📍 Step 2: Finding edge agents...');
    const agentResult = await client.query(`
      SELECT 
        id,
        branch_node_id,
        name,
        version,
        status,
        last_seen_at,
        public_media_url,
        created_at
      FROM edge_agents
      WHERE branch_node_id = $1
      ORDER BY created_at DESC
    `, [branch.id]);

    if (agentResult.rows.length === 0) {
      console.log(`❌ No edge agents registered for branch "${branch.name}"\n`);
      console.log('💡 You need to register an edge agent first!');
      return;
    }

    console.log(`✅ Found ${agentResult.rows.length} edge agent(s):\n`);

    agentResult.rows.forEach((agent, index) => {
      console.log(`Agent #${index + 1}:`);
      console.log(`  Name:           ${agent.name}`);
      console.log(`  ID:             ${agent.id}`);
      console.log(`  Branch ID:      ${agent.branch_node_id}`);
      console.log(`  Version:        ${agent.version || 'Unknown'}`);
      console.log(`  Status:         ${agent.status}`);
      console.log(`  Last Seen:      ${agent.last_seen_at || 'Never'}`);
      console.log(`  Media URL:      ${agent.public_media_url || 'Not set'}`);
      console.log(`  Created:        ${agent.created_at}`);
      console.log('');
    });

    // 3. Show what WOULD be embedded in the downloaded package
    const primaryAgent = agentResult.rows[0];
    
    console.log('=' .repeat(80));
    console.log('📦 CONFIGURATION THAT WOULD BE EMBEDDED IN DOWNLOAD:');
    console.log('=' .repeat(80));
    console.log('');
    console.log('BRANCH_ID=' + JSON.stringify(primaryAgent.branch_node_id));
    console.log('EDGE_AGENT_ID=' + JSON.stringify(primaryAgent.id));
    console.log('EDGE_AGENT_NAME=' + JSON.stringify(primaryAgent.name));
    console.log('EDGE_AGENT_VERSION=' + JSON.stringify(primaryAgent.version || '0.1.0'));
    console.log('');
    console.log('⚠️  IMPORTANT CHECKS:');
    console.log('');
    
    // Check for mismatches
    let warnings = [];
    
    if (agentResult.rows.length > 1) {
      warnings.push(`⚠️  Multiple edge agents exist for this branch. The FIRST agent (${primaryAgent.name}) will be used.`);
    }
    
    if (primaryAgent.branch_node_id !== branch.id) {
      warnings.push(`❌ MISMATCH: Agent's branch_node_id (${primaryAgent.branch_node_id}) != Branch ID (${branch.id})`);
    }
    
    if (primaryAgent.status === 'offline') {
      warnings.push(`⚠️  Agent status is OFFLINE. Last seen: ${primaryAgent.last_seen_at || 'Never'}`);
    }
    
    const daysSinceLastSeen = primaryAgent.last_seen_at 
      ? Math.floor((Date.now() - new Date(primaryAgent.last_seen_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    
    if (daysSinceLastSeen && daysSinceLastSeen > 7) {
      warnings.push(`⚠️  Agent hasn't been seen in ${daysSinceLastSeen} days. It may be using old config.`);
    }

    // Check for duplicate agents with same name
    const duplicateNames = agentResult.rows.filter(a => a.name === primaryAgent.name);
    if (duplicateNames.length > 1) {
      warnings.push(`⚠️  Multiple agents with name "${primaryAgent.name}" exist. This may cause confusion.`);
      console.log('   Duplicate agent IDs:');
      duplicateNames.forEach(a => console.log(`     - ${a.id} (created: ${a.created_at})`));
    }

    if (warnings.length === 0) {
      console.log('✅ No issues detected! Configuration looks good.');
    } else {
      warnings.forEach(w => console.log(w));
    }
    
    console.log('');
    console.log('=' .repeat(80));
    console.log('');
    console.log('💡 RECOMMENDATIONS:');
    console.log('');
    console.log('1. If you see "old things" in the downloader:');
    console.log('   - Check if there are multiple edge agents (shown above)');
    console.log('   - The FIRST agent (most recent) is used for downloads');
    console.log('   - Consider deleting old/unused agents from the database');
    console.log('');
    console.log('2. To fix duplicate/old agents:');
    console.log('   DELETE FROM edge_agents WHERE id = \'<old-agent-id>\';');
    console.log('');
    console.log('3. To update agent information:');
    console.log('   UPDATE edge_agents SET name = \'<new-name>\', version = \'<version>\' WHERE id = \'<agent-id>\';');
    console.log('');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error);
  } finally {
    await client.end();
    console.log('🔌 Connection closed\n');
  }
}

diagnoseConfig();
