#!/usr/bin/env node
/**
 * Get Gateway Information from Database
 * This will show you the gateway ID and help configure the edge agent
 */

import pkg from 'pg';
const { Client } = pkg;

const DATABASE_URL = 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';
const GATEWAY_NAME = 'A1';

async function getGatewayInfo() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected\n');

    // Query for edge agents/gateways
    const result = await client.query(`
      SELECT 
        id,
        branch_node_id as branch_id,
        name,
        version,
        status,
        last_seen_at,
        public_media_url
      FROM edge_agents
      WHERE name ILIKE $1
      ORDER BY created_at DESC
      LIMIT 5
    `, [`%${GATEWAY_NAME}%`]);

    if (result.rows.length === 0) {
      console.log(`❌ No gateway found with name containing "${GATEWAY_NAME}"\n`);
      console.log('Available gateways:');
      
      const allGateways = await client.query(`
        SELECT name, id, status
        FROM edge_agents
        ORDER BY name
        LIMIT 20
      `);
      
      if (allGateways.rows.length > 0) {
        allGateways.rows.forEach(gw => {
          console.log(`  - ${gw.name} (${gw.id}) - Status: ${gw.status}`);
        });
      } else {
        console.log('  No gateways found in database');
      }
      
      return;
    }

    console.log('📊 Gateway Information:\n');
    console.log('='.repeat(80));
    
    result.rows.forEach((gateway, index) => {
      console.log(`\nGateway #${index + 1}:`);
      console.log(`  Name:         ${gateway.name}`);
      console.log(`  ID:           ${gateway.id}`);
      console.log(`  Branch ID:    ${gateway.branch_id || 'Not assigned'}`);
      console.log(`  Version:      ${gateway.version || 'Unknown'}`);
      console.log(`  Status:       ${gateway.status}`);
      console.log(`  Last Seen:    ${gateway.last_seen_at || 'Never'}`);
      console.log(`  Media URL:    ${gateway.public_media_url || 'Not configured'}`);
    });
    
    console.log('\n' + '='.repeat(80));
    
    const mainGateway = result.rows[0];
    
    console.log('\n📝 Configuration for Edge Agent:\n');
    console.log('EDGE_AGENT_ID="' + mainGateway.id + '"');
    console.log('GATEWAY_NAME="' + mainGateway.name + '"');
    console.log('BRANCH_ID="' + (mainGateway.branch_id || 'NOT_SET') + '"');
    
    console.log('\n⚠️  IMPORTANT: You need a BRIDGE KEY to authenticate!');
    console.log('The bridge key is not stored in the database (it\'s a shared secret).');
    console.log('You need to either:');
    console.log('  1. Use the key that was generated when H1 was registered');
    console.log('  2. Generate a new key and update it in your .env file');
    console.log('  3. Register H1 again with a new bridge key\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed\n');
  }
}

getGatewayInfo();
