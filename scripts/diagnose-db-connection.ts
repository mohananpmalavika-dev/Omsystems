#!/usr/bin/env ts-node
/**
 * Database Connection Diagnostic Script
 * 
 * Run this to diagnose PostgreSQL connection issues
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

interface DiagnosticResult {
  test: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

async function runDiagnostics() {
  const results: DiagnosticResult[] = [];

  console.log('🔍 Starting Database Connection Diagnostics...\n');

  // Test 1: Check environment variables
  console.log('1️⃣  Checking environment variables...');
  const hasDBUrl = !!process.env.DATABASE_URL;
  results.push({
    test: 'Environment Variables',
    status: hasDBUrl ? 'pass' : 'fail',
    message: hasDBUrl 
      ? 'DATABASE_URL is set' 
      : 'DATABASE_URL is missing',
    details: {
      DATABASE_URL: hasDBUrl ? '***SET***' : 'MISSING',
      PGUSER: process.env.PGUSER ? '***SET***' : 'not set',
      PGHOST: process.env.PGHOST || 'not set',
      PGPORT: process.env.PGPORT || 'not set',
      PGDATABASE: process.env.PGDATABASE || 'not set',
    }
  });

  if (!hasDBUrl) {
    console.error('❌ DATABASE_URL not found. Cannot proceed.\n');
    printResults(results);
    process.exit(1);
  }

  // Test 2: Parse connection string
  console.log('2️⃣  Parsing connection string...');
  try {
    const url = new URL(process.env.DATABASE_URL!);
    results.push({
      test: 'Connection String Parsing',
      status: 'pass',
      message: 'Successfully parsed DATABASE_URL',
      details: {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || '5432',
        database: url.pathname.slice(1),
        username: url.username ? '***SET***' : 'missing',
        password: url.password ? '***SET***' : 'missing',
      }
    });
  } catch (error: any) {
    results.push({
      test: 'Connection String Parsing',
      status: 'fail',
      message: 'Failed to parse DATABASE_URL',
      details: error.message
    });
  }

  // Test 3: Create connection pool
  console.log('3️⃣  Creating connection pool...');
  let pool: Pool;
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 5,
      connectionTimeoutMillis: 10000,
    });

    results.push({
      test: 'Pool Creation',
      status: 'pass',
      message: 'Connection pool created successfully'
    });
  } catch (error: any) {
    results.push({
      test: 'Pool Creation',
      status: 'fail',
      message: 'Failed to create connection pool',
      details: error.message
    });
    printResults(results);
    process.exit(1);
  }

  // Test 4: Test basic connection
  console.log('4️⃣  Testing basic connection...');
  try {
    const start = Date.now();
    await pool!.query('SELECT 1 as test');
    const duration = Date.now() - start;

    results.push({
      test: 'Basic Connection',
      status: 'pass',
      message: 'Successfully connected to database',
      details: {
        responseTime: `${duration}ms`
      }
    });
  } catch (error: any) {
    results.push({
      test: 'Basic Connection',
      status: 'fail',
      message: 'Failed to connect to database',
      details: {
        code: error.code,
        message: error.message,
        severity: error.severity
      }
    });
  }

  // Test 5: Check database version
  console.log('5️⃣  Checking database version...');
  try {
    const result = await pool!.query('SELECT version()');
    const version = result.rows[0].version;

    results.push({
      test: 'Database Version',
      status: 'pass',
      message: 'Retrieved database version',
      details: { version }
    });
  } catch (error: any) {
    results.push({
      test: 'Database Version',
      status: 'fail',
      message: 'Failed to retrieve database version',
      details: error.message
    });
  }

  // Test 6: Check connection pool stats
  console.log('6️⃣  Checking connection pool statistics...');
  const poolStats = {
    total: pool!.totalCount,
    idle: pool!.idleCount,
    waiting: pool!.waitingCount
  };

  const hasWaiting = poolStats.waiting > 0;
  results.push({
    test: 'Connection Pool Stats',
    status: hasWaiting ? 'warning' : 'pass',
    message: hasWaiting 
      ? 'Warning: Connections are waiting' 
      : 'Pool is healthy',
    details: poolStats
  });

  // Test 7: Test multiple concurrent connections
  console.log('7️⃣  Testing concurrent connections...');
  try {
    const promises = Array(5).fill(null).map(() => 
      pool!.query('SELECT pg_sleep(0.1)')
    );
    
    const start = Date.now();
    await Promise.all(promises);
    const duration = Date.now() - start;

    results.push({
      test: 'Concurrent Connections',
      status: 'pass',
      message: 'Successfully handled 5 concurrent queries',
      details: {
        totalTime: `${duration}ms`,
        avgTime: `${(duration / 5).toFixed(2)}ms`
      }
    });
  } catch (error: any) {
    results.push({
      test: 'Concurrent Connections',
      status: 'fail',
      message: 'Failed concurrent connection test',
      details: error.message
    });
  }

  // Test 8: Check required tables
  console.log('8️⃣  Checking required database tables...');
  try {
    const result = await pool!.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const tables = result.rows.map(r => r.table_name);
    const requiredTables = [
      'tenants',
      'users',
      'incidents',
      'infrastructure_health_metrics'
    ];

    const missingTables = requiredTables.filter(t => !tables.includes(t));

    results.push({
      test: 'Required Tables',
      status: missingTables.length === 0 ? 'pass' : 'warning',
      message: missingTables.length === 0 
        ? 'All required tables exist' 
        : `Missing tables: ${missingTables.join(', ')}`,
      details: {
        totalTables: tables.length,
        foundTables: tables.slice(0, 10),
        missingTables
      }
    });
  } catch (error: any) {
    results.push({
      test: 'Required Tables',
      status: 'fail',
      message: 'Failed to check tables',
      details: error.message
    });
  }

  // Test 9: Test write operation
  console.log('9️⃣  Testing write operation...');
  try {
    await pool!.query(`
      CREATE TABLE IF NOT EXISTS diagnostic_test (
        id SERIAL PRIMARY KEY,
        test_time TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool!.query(`INSERT INTO diagnostic_test DEFAULT VALUES`);
    const result = await pool!.query(`SELECT COUNT(*) FROM diagnostic_test`);
    await pool!.query(`DROP TABLE diagnostic_test`);

    results.push({
      test: 'Write Operation',
      status: 'pass',
      message: 'Successfully performed write operation',
      details: {
        recordsCreated: 1
      }
    });
  } catch (error: any) {
    results.push({
      test: 'Write Operation',
      status: 'fail',
      message: 'Failed write operation',
      details: {
        code: error.code,
        message: error.message
      }
    });
  }

  // Cleanup
  await pool!.end();

  // Print results
  printResults(results);

  // Exit with appropriate code
  const hasFailures = results.some(r => r.status === 'fail');
  process.exit(hasFailures ? 1 : 0);
}

function printResults(results: DiagnosticResult[]) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 DIAGNOSTIC RESULTS');
  console.log('='.repeat(60) + '\n');

  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  results.forEach(result => {
    const icon = result.status === 'pass' ? '✅' : result.status === 'warning' ? '⚠️' : '❌';
    console.log(`${icon} ${result.test}: ${result.message}`);

    if (result.details) {
      console.log(`   Details:`, JSON.stringify(result.details, null, 2));
    }
    console.log();

    if (result.status === 'pass') passCount++;
    else if (result.status === 'warning') warnCount++;
    else failCount++;
  });

  console.log('='.repeat(60));
  console.log(`Summary: ${passCount} passed, ${warnCount} warnings, ${failCount} failed`);
  console.log('='.repeat(60) + '\n');

  if (failCount > 0) {
    console.log('❌ Database connection has issues. Review failed tests above.');
    console.log('📖 See docs/PRODUCTION_DATABASE_TROUBLESHOOTING.md for solutions.\n');
  } else if (warnCount > 0) {
    console.log('⚠️  Database connection works but has warnings.');
    console.log('📖 Review warnings and consider optimizations.\n');
  } else {
    console.log('✅ Database connection is healthy!\n');
  }
}

// Run diagnostics
runDiagnostics().catch(error => {
  console.error('💥 Diagnostic script failed:', error);
  process.exit(1);
});
