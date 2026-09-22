/**
 * Edge Agent Setup After Control Plane Redeployment
 * Helps configure edge agent after control plane is redeployed
 */

import { config } from 'dotenv';

config({ path: '.env' });

const CONTROL_PLANE = process.env.CONTROL_PLANE_URL || 'http://3.7.216.169:8080';

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║   Edge Agent Setup - After Control Plane Redeployment        ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

console.log(`Control Plane: ${CONTROL_PLANE}\n`);

// Check control plane health
console.log('🔍 Checking control plane status...\n');

try {
  const healthResponse = await fetch(`${CONTROL_PLANE}/health`, {
    headers: { 'Accept': 'application/json' }
  });
  
  if (healthResponse.ok) {
    const health = await healthResponse.json();
    console.log('✅ Control plane is HEALTHY');
    console.log(`   Status: ${health.status || 'ok'}`);
    console.log(`   Version: ${health.version || 'unknown'}\n`);
  } else {
    console.log('⚠️  Control plane returned:', healthResponse.status, '\n');
  }
} catch (error) {
  console.log('❌ Cannot reach control plane:', error.message);
  console.log('\n⚠️  Make sure the control plane is running and accessible!\n');
  process.exit(1);
}

console.log('═══════════════════════════════════════════════════════════════\n');
console.log('📋 SETUP CHECKLIST (After Redeployment)\n');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('Step 1: Initial Login & Setup');
console.log('─────────────────────────────────────────────────────────────');
console.log(`  1. Open browser: ${CONTROL_PLANE}`);
console.log('  2. If first time:');
console.log('     → Complete initial setup wizard');
console.log('     → Create admin account');
console.log('     → Set organization details');
console.log('  3. If already set up:');
console.log('     → Login with your credentials\n');

console.log('Step 2: Create/Verify Branch');
console.log('─────────────────────────────────────────────────────────────');
console.log('  1. Go to: Workspace → Branches');
console.log('  2. Check if your branch exists');
console.log('  3. If not, create a new branch:');
console.log('     → Click "Add Branch"');
console.log('     → Enter branch details');
console.log('     → Save\n');

console.log('Step 3: Register Edge Agent');
console.log('─────────────────────────────────────────────────────────────');
console.log('  1. Navigate to your branch');
console.log('  2. Go to: Edge Agents / Scanner section');
console.log('  3. Click "Register New Edge Agent" or "Add Scanner"');
console.log('  4. Fill in details:');
console.log('     → Name: "KryptonLogic Central Scanner"');
console.log('     → TTL: 60 minutes (or more)');
console.log('  5. Click "Generate Activation Code"');
console.log('  6. 📋 COPY the activation code (starts with "sgact_")\n');

console.log('Step 4: Update Edge Agent Configuration');
console.log('─────────────────────────────────────────────────────────────');
console.log('  Option A - Automated (Recommended):');
console.log('    powershell .\\update-activation-code.ps1');
console.log('    # Paste your new activation code when prompted\n');
console.log('  Option B - Manual:');
console.log('    1. Open: edge-agent\\.env');
console.log('    2. Update: EDGE_ACTIVATION_CODE=<your-new-code>');
console.log('    3. Save file\n');

console.log('Step 5: Restart Edge Agent');
console.log('─────────────────────────────────────────────────────────────');
console.log('  .\\START_SCANNER_SIMPLE.bat\n');

console.log('Step 6: Verify Registration');
console.log('─────────────────────────────────────────────────────────────');
console.log('  1. Check edge agent logs:');
console.log('     Get-Content logs\\edge-agent.log -Tail 20');
console.log('  2. Look for:');
console.log('     ✓ "Successfully registered with control plane"');
console.log('     ✓ "Synchronized N camera(s)"');
console.log('  3. Check dashboard:');
console.log('     → Edge agent should show as "online"\n');

console.log('═══════════════════════════════════════════════════════════════\n');
console.log('🔄 IMPORTANT: Re-Register ALL Edge Agents\n');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('Since the control plane was redeployed, ALL previous edge');
console.log('agent registrations were lost. You need to:');
console.log('  1. Get new activation codes for ALL edge agents');
console.log('  2. Update each edge agent\'s .env file');
console.log('  3. Restart each edge agent\n');

console.log('═══════════════════════════════════════════════════════════════\n');
console.log('💡 PRO TIPS\n');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('• Activation codes expire (default: 60 minutes)');
console.log('  → Generate code just before updating edge agent');
console.log('  → Or set longer TTL when generating\n');

console.log('• Keep your .env backup safe');
console.log('  → Useful for quick recovery');
console.log('  → Contains all configuration\n');

console.log('• Set up persistent data for control plane');
console.log('  → Prevents losing registrations on redeploy');
console.log('  → Use PostgreSQL with persistent volumes');
console.log('  → Back up database regularly\n');

console.log('• Consider using environment variables');
console.log('  → For control plane database connection');
console.log('  → Prevents data loss on container restart\n');

console.log('═══════════════════════════════════════════════════════════════\n');
console.log('🚀 READY TO START?\n');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('1. Open your browser now:');
console.log(`   ${CONTROL_PLANE}\n`);

console.log('2. Complete the setup steps above\n');

console.log('3. Then run:');
console.log('   .\\update-activation-code.ps1\n');

console.log('═══════════════════════════════════════════════════════════════\n');
console.log('Need help? Check EDGE_AGENT_FIX_GUIDE.md for details.');
console.log('═══════════════════════════════════════════════════════════════\n');
