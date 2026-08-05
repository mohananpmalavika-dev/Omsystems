#!/usr/bin/env node
/**
 * Test Render deployment health checks
 * Usage: node scripts/test-render-health.mjs [service-url]
 */

const BASE_URL = process.argv[2] || 'https://sentinel-grid-monitoring1.onrender.com';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function success(msg) {
  console.log(`${colors.green}✓${colors.reset} ${msg}`);
}

function failure(msg) {
  console.log(`${colors.red}✗${colors.reset} ${msg}`);
}

function info(msg) {
  console.log(`${colors.blue}ℹ${colors.reset} ${msg}`);
}

function warning(msg) {
  console.log(`${colors.yellow}⚠${colors.reset} ${msg}`);
}

async function testEndpoint(url, name, shouldContain) {
  try {
    info(`Testing ${name}: ${url}`);
    const startTime = Date.now();
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });
    const duration = Date.now() - startTime;
    
    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json');
    const body = isJson ? await response.json() : await response.text();
    
    console.log(`  Status: ${response.status} (${duration}ms)`);
    console.log(`  Content-Type: ${contentType}`);
    
    if (response.ok) {
      success(`${name} is responding`);
      if (isJson) {
        console.log('  Response:', JSON.stringify(body, null, 2));
      } else {
        console.log('  Response:', body.substring(0, 200));
      }
      
      if (shouldContain) {
        const bodyStr = isJson ? JSON.stringify(body) : body;
        if (bodyStr.includes(shouldContain)) {
          success(`Response contains expected content: "${shouldContain}"`);
        } else {
          warning(`Response missing expected content: "${shouldContain}"`);
        }
      }
      
      return true;
    } else {
      failure(`${name} returned ${response.status}`);
      console.log('  Response:', isJson ? JSON.stringify(body, null, 2) : body);
      return false;
    }
  } catch (error) {
    failure(`${name} failed`);
    console.error(`  Error: ${error.message}`);
    if (error.cause) {
      console.error(`  Cause: ${error.cause.message}`);
    }
    return false;
  }
}

async function main() {
  console.log('\n=== Sentinel Grid Render Health Check ===\n');
  console.log(`Testing: ${BASE_URL}\n`);
  
  const tests = [
    { path: '/health', name: 'Basic Health Check', shouldContain: 'ok' },
    { path: '/ready', name: 'Ready Check (with DB)', shouldContain: 'ready' },
    { path: '/metrics', name: 'Prometheus Metrics', shouldContain: 'sentinel_' },
    { path: '/v1/me', name: 'Auth Endpoint (should fail without auth)', shouldContain: null },
    { path: '/api/control/v1/branches', name: 'Branches API (via proxy)', shouldContain: null },
  ];
  
  const results = [];
  for (const test of tests) {
    const url = `${BASE_URL}${test.path}`;
    const result = await testEndpoint(url, test.name, test.shouldContain);
    results.push({ name: test.name, passed: result });
    console.log(''); // blank line
  }
  
  // Summary
  console.log('=== Summary ===\n');
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach(r => {
    if (r.passed) {
      success(r.name);
    } else {
      failure(r.name);
    }
  });
  
  console.log(`\n${passed}/${total} checks passed\n`);
  
  if (results[0].passed && !results[1].passed) {
    warning('Health check passes but ready check fails → Database connectivity issue');
    console.log('\nNext steps:');
    console.log('1. Check Render dashboard → sentinel-grid-db status');
    console.log('2. Review control-plane service logs for database errors');
    console.log('3. Verify DATABASE_URL environment variable is set');
  }
  
  if (!results[0].passed && !results[1].passed) {
    warning('Both health checks failing → Service not starting');
    console.log('\nNext steps:');
    console.log('1. Check Render dashboard → sentinel-grid-control-plane logs');
    console.log('2. Look for migration errors or startup failures');
    console.log('3. Verify all required environment variables are set');
  }
  
  if (results[0].passed && results[1].passed) {
    success('Service is healthy! 502 errors might be intermittent or resolved.');
  }
  
  process.exit(passed === total ? 0 : 1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
