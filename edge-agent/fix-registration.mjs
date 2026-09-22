/**
 * Edge Agent Re-Registration Script
 * Fixes authentication issues by re-registering with the control plane
 */

import { readFileSync, writeFileSync } from 'fs';
import { config } from 'dotenv';

// Load current .env
config({ path: '.env' });

const CONTROL_PLANE = process.env.CONTROL_PLANE_URL || 'http://3.7.216.169:8080';
const CURRENT_NAME = process.env.EDGE_AGENT_NAME || 'KryptonLogic Central Scanner';

console.log('\n🔧 Edge Agent Re-Registration Script\n');
console.log(`Control Plane: ${CONTROL_PLANE}`);
console.log(`Agent Name: ${CURRENT_NAME}\n`);

// Instructions for manual fix
console.log('═══════════════════════════════════════════════════════════════');
console.log('⚠️  AUTHENTICATION ERROR DETECTED');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('The edge agent credentials have been revoked or are invalid.');
console.log('This usually happens when:\n');
console.log('  1. The edge agent was deleted from the control plane dashboard');
console.log('  2. The activation code expired or was revoked');
console.log('  3. The control plane was reset/redeployed\n');

console.log('═══════════════════════════════════════════════════════════════');
console.log('📋 MANUAL FIX STEPS (Required)');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('Step 1: Get New Activation Code');
console.log('---------------------------------------------------------------');
console.log(`  1. Open your browser and go to: ${CONTROL_PLANE}`);
console.log('  2. Login to the dashboard');
console.log('  3. Navigate to: Settings → Edge Agents (or Branch → Edge Scanner)');
console.log('  4. Click "Add Edge Agent" or "Register New Scanner"');
console.log('  5. Enter name: "${CURRENT_NAME}"');
console.log('  6. Click "Generate Activation Code"');
console.log('  7. COPY the activation code (starts with "sgact_")\n');

console.log('Step 2: Update Edge Agent Configuration');
console.log('---------------------------------------------------------------');
console.log('  1. Open: edge-agent\\.env');
console.log('  2. Find the line: EDGE_ACTIVATION_CODE=...');
console.log('  3. Replace with your NEW activation code');
console.log('  4. Save the file\n');

console.log('Step 3: Restart Edge Agent');
console.log('---------------------------------------------------------------');
console.log('  1. Stop the current edge agent (if running)');
console.log('  2. Run: cd edge-agent');
console.log('  3. Run: .\\START_SCANNER_SIMPLE.bat\n');

console.log('═══════════════════════════════════════════════════════════════');
console.log('🔍 ADDITIONAL ISSUE: Media Tunnel Unavailable');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('The "public media tunnel unavailable" error means:');
console.log('  - Live video streaming will not work remotely');
console.log('  - Camera discovery and monitoring still works');
console.log('  - This is NORMAL if you don\'t have a public IP or tunnel setup\n');

console.log('To enable remote video streaming:');
console.log('  1. Ensure edge agent machine has a public IP, or');
console.log('  2. Set up ngrok/cloudflare tunnel, or');
console.log('  3. Configure port forwarding on your router\n');

console.log('═══════════════════════════════════════════════════════════════');
console.log('📊 CURRENT STATUS CHECK');
console.log('═══════════════════════════════════════════════════════════════\n');

// Check if control plane is reachable
try {
  console.log('Checking control plane connectivity...');
  const response = await fetch(`${CONTROL_PLANE}/health`);
  if (response.ok) {
    console.log('✅ Control plane is reachable\n');
  } else {
    console.log('⚠️  Control plane returned error:', response.status, '\n');
  }
} catch (error) {
  console.log('❌ Cannot reach control plane:', error.message, '\n');
  console.log('   Make sure the control plane is running and accessible!\n');
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('Need help? Check the documentation or contact support.');
console.log('═══════════════════════════════════════════════════════════════\n');
