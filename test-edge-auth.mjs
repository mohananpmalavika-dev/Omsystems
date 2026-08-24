#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import 'dotenv/config';

const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_INTERNAL_URL || 
  'https://sentinel-grid-monitoring-s38w.onrender.com';

async function testEdgeAuth() {
  try {
    // Read the token
    const token = await readFile('.scanner-runtime/edge-agent-token.txt', 'utf8');
    console.log('🔑 Testing edge agent authentication...');
    console.log(`   Control Plane: ${CONTROL_PLANE_URL}`);
    console.log(`   Token: ${token.substring(0, 16)}...`);
    console.log('');
    
    // Test heartbeat endpoint
    const response = await fetch(`${CONTROL_PLANE_URL}/edge-bridge/cameras/batch-heartbeat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        updates: []
      })
    });
    
    console.log(`📡 Response Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      console.log('✅ Authentication SUCCESSFUL!');
      console.log('   Edge agent can now communicate with control plane');
    } else {
      const error = await response.text();
      console.log('❌ Authentication FAILED!');
      console.log(`   Error: ${error}`);
      console.log('\n🔧 Troubleshooting:');
      console.log('   1. Verify the token in the database matches');
      console.log('   2. Check if credential_revoked_at is NULL');
      console.log('   3. Verify the control plane URL is correct');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testEdgeAuth().catch(console.error);
