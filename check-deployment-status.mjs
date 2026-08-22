#!/usr/bin/env node
/**
 * Check Deployment Status
 * Diagnoses connection issues between dashboard and control plane
 */

import fetch from 'node-fetch';

const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || 'http://localhost:3000';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3001';

console.log('🔍 Deployment Status Check\n');
console.log('=' .repeat(60));

async function checkEndpoint(name, url) {
  console.log(`\n${name}:`);
  console.log(`  URL: ${url}`);
  
  try {
    const start = Date.now();
    const response = await fetch(url, { 
      method: 'GET',
      headers: { 'User-Agent': 'KryptonVision-Diagnostic/1.0' },
      timeout: 5000
    });
    const duration = Date.now() - start;
    
    console.log(`  ✅ Status: ${response.status} ${response.statusText}`);
    console.log(`  ⏱️  Response time: ${duration}ms`);
    
    return true;
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    
    if (error.code === 'ENOTFOUND') {
      console.log(`  💡 DNS not resolving - check domain configuration`);
    } else if (error.code === 'ECONNREFUSED') {
      console.log(`  💡 Connection refused - service may not be running`);
    } else if (error.code === 'ETIMEDOUT') {
      console.log(`  💡 Timeout - service may be slow or unreachable`);
    }
    
    return false;
  }
}

async function checkDNS(domain) {
  console.log(`\nDNS Resolution for ${domain}:`);
  
  try {
    const { Resolver } = await import('dns').then(m => m.promises);
    const resolver = new Resolver();
    
    const addresses = await resolver.resolve4(domain);
    console.log(`  ✅ Resolves to: ${addresses.join(', ')}`);
    return true;
  } catch (error) {
    console.log(`  ❌ DNS Error: ${error.message}`);
    return false;
  }
}

async function main() {
  // Check control plane
  await checkEndpoint(
    'Control Plane Health',
    `${CONTROL_PLANE_URL}/health`
  );
  
  // Check dashboard
  await checkEndpoint(
    'Dashboard',
    DASHBOARD_URL
  );
  
  // Check DNS for Render domains
  const renderDomains = [
    'sentinel-grid-monitoring1.onrender.com',
    'omsystems.onrender.com',
  ];
  
  for (const domain of renderDomains) {
    await checkDNS(domain);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n📋 RECOMMENDATIONS:\n');
  
  console.log('1. If DNS errors: Update environment variables');
  console.log('   Dashboard .env.local:');
  console.log('     NEXT_PUBLIC_API_BASE=/api/control\n');
  
  console.log('2. If running locally: Use localhost URLs');
  console.log('   Control Plane: http://localhost:3000');
  console.log('   Dashboard: http://localhost:3001\n');
  
  console.log('3. If deployed on Render: Check service URLs in Render dashboard');
  console.log('   Make sure both services are deployed and running\n');
  
  console.log('4. Check .env files for hardcoded URLs that should be relative paths\n');
}

main().catch(console.error);
