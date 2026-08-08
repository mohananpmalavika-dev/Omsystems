#!/usr/bin/env node

/**
 * Test Control Plane Authentication
 */

const CONTROL_PLANE_URL = 'https://sentinel-grid-control-plane1.onrender.com';
const SHARED_KEY = 'WBRrQzol9gGTuIEAVd08kvMFP5pfyNDj1m32qZ7YsShOcxHa';
const AGENT_ID = '6a570d4a-2c71-415f-b59a-643cf50d55c5';

console.log('🧪 Testing Control Plane Authentication\n');

// Test 1: Heartbeat with x-edge-bridge-key
console.log('Test 1: Heartbeat with x-edge-bridge-key header');
try {
  const response = await fetch(`${CONTROL_PLANE_URL}/api/edge/heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-edge-bridge-key': SHARED_KEY
    },
    body: JSON.stringify({
      agentId: AGENT_ID,
      version: '0.1.0'
    })
  });
  
  const text = await response.text();
  console.log(`   Status: ${response.status}`);
  console.log(`   Response: ${text}\n`);
} catch (error) {
  console.log(`   ❌ Error: ${error.message}\n`);
}

// Test 2: Register with x-edge-bridge-key
console.log('Test 2: Register with x-edge-bridge-key header');
try {
  const response = await fetch(`${CONTROL_PLANE_URL}/api/edge/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-edge-bridge-key': SHARED_KEY
    },
    body: JSON.stringify({
      branchId: '00000000-0000-4000-8000-000000000104',
      name: 'Test Scanner',
      version: '0.1.0'
    })
  });
  
  const text = await response.text();
  console.log(`   Status: ${response.status}`);
  console.log(`   Response: ${text}\n`);
} catch (error) {
  console.log(`   ❌ Error: ${error.message}\n`);
}

// Test 3: Check if AUTH_MODE might be different
console.log('Test 3: Checking health endpoint');
try {
  const response = await fetch(`${CONTROL_PLANE_URL}/health`);
  const data = await response.json();
  console.log(`   Status: ${response.status}`);
  console.log(`   Response:`, data, '\n');
} catch (error) {
  console.log(`   ❌ Error: ${error.message}\n`);
}

console.log('💡 Diagnosis:');
console.log('- If you see 401 errors, the control plane might not have EDGE_BRIDGE_SHARED_KEY configured');
console.log('- Check your Render dashboard Environment variables');
console.log('- The key must match exactly on both sides\n');
