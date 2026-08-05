#!/usr/bin/env node
/**
 * Check Render configuration for common issues
 * Reads render.yaml and validates the configuration
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = join(dirname(scriptPath), '..');
const renderYamlPath = join(projectRoot, 'render.yaml');

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

function warning(msg) {
  console.log(`${colors.yellow}⚠${colors.reset} ${msg}`);
}

function info(msg) {
  console.log(`${colors.blue}ℹ${colors.reset} ${msg}`);
}

function checkService(service, issues) {
  console.log(`\n${colors.blue}Checking service: ${service.name}${colors.reset}`);
  
  // Check health check path
  if (service.healthCheckPath) {
    success(`Health check: ${service.healthCheckPath}`);
  } else if (service.type === 'web') {
    warning('No health check configured');
    issues.push(`${service.name}: Missing healthCheckPath`);
  }
  
  // Check required environment variables
  const envVars = service.envVars || [];
  const envVarMap = {};
  envVars.forEach(env => {
    envVarMap[env.key] = env;
  });
  
  // Check critical env vars
  const criticalVars = {
    web: ['PORT', 'HOST'],
    pserv: ['PORT', 'HOST'],
  };
  
  const critical = criticalVars[service.type] || [];
  critical.forEach(key => {
    if (envVarMap[key]) {
      success(`${key}: ${envVarMap[key].value || envVarMap[key].generateValue ? '✓' : 'from service'}`);
    } else {
      failure(`Missing critical env var: ${key}`);
      issues.push(`${service.name}: Missing ${key}`);
    }
  });
  
  // Check for sync: false (requires manual setup)
  const manualVars = envVars.filter(env => env.sync === false);
  if (manualVars.length > 0) {
    warning(`${manualVars.length} environment variable(s) require manual setup:`);
    manualVars.forEach(env => {
      console.log(`  - ${env.key} (must be set in Render dashboard)`);
    });
    issues.push(`${service.name}: Has ${manualVars.length} variables needing manual setup`);
  }
  
  // Check Docker configuration
  if (service.dockerfilePath) {
    info(`Dockerfile: ${service.dockerfilePath}`);
  }
  
  // Check plan/resources
  if (service.plan) {
    info(`Plan: ${service.plan}`);
    if (service.plan === 'starter') {
      info('  Resources: 512MB RAM, 0.5 CPU');
    }
  }
  
  // Check disk for pserv
  if (service.type === 'pserv' && service.disk) {
    success(`Persistent disk: ${service.disk.mountPath} (${service.disk.sizeGB}GB)`);
  }
}

function checkDatabase(database, issues) {
  console.log(`\n${colors.blue}Checking database: ${database.name}${colors.reset}`);
  
  if (database.plan) {
    success(`Plan: ${database.plan}`);
  }
  
  if (database.region) {
    success(`Region: ${database.region}`);
  }
  
  if (database.databaseName) {
    success(`Database name: ${database.databaseName}`);
  }
  
  if (database.diskSizeGB) {
    info(`Disk size: ${database.diskSizeGB}GB`);
  }
  
  if (database.storageAutoscalingEnabled) {
    success('Storage autoscaling: enabled');
  }
}

async function main() {
  console.log('\n=== Render Configuration Check ===\n');
  
  let config;
  try {
    const yamlContent = readFileSync(renderYamlPath, 'utf8');
    config = YAML.parse(yamlContent);
    success('render.yaml loaded successfully');
  } catch (error) {
    failure(`Failed to load render.yaml: ${error.message}`);
    process.exit(1);
  }
  
  const issues = [];
  
  // Check services
  console.log(`\n${colors.blue}=== Services ===${colors.reset}`);
  if (config.services && Array.isArray(config.services)) {
    success(`Found ${config.services.length} service(s)`);
    config.services.forEach(service => checkService(service, issues));
  } else {
    failure('No services found in render.yaml');
  }
  
  // Check databases
  console.log(`\n${colors.blue}=== Databases ===${colors.reset}`);
  if (config.databases && Array.isArray(config.databases)) {
    success(`Found ${config.databases.length} database(s)`);
    config.databases.forEach(database => checkDatabase(database, issues));
  } else {
    warning('No databases found in render.yaml');
  }
  
  // Check service dependencies
  console.log(`\n${colors.blue}=== Service Dependencies ===${colors.reset}`);
  const controlPlane = config.services.find(s => s.name === 'sentinel-grid-control-plane');
  if (controlPlane) {
    const dbUrlEnv = controlPlane.envVars?.find(e => e.key === 'DATABASE_URL');
    if (dbUrlEnv && dbUrlEnv.fromDatabase) {
      success(`Control plane linked to database: ${dbUrlEnv.fromDatabase.name}`);
    } else {
      failure('Control plane DATABASE_URL not linked to database');
      issues.push('Control plane: DATABASE_URL not configured');
    }
  }
  
  // Summary
  console.log(`\n${colors.blue}=== Summary ===${colors.reset}\n`);
  
  if (issues.length === 0) {
    success('No critical issues found');
    console.log('\nIf you\'re still seeing 502 errors:');
    console.log('1. Check Render dashboard for service status');
    console.log('2. Review service logs for errors');
    console.log('3. Run: node scripts/test-render-health.mjs');
  } else {
    warning(`Found ${issues.length} potential issue(s):\n`);
    issues.forEach((issue, i) => {
      console.log(`${i + 1}. ${issue}`);
    });
    console.log('\nAction items:');
    console.log('1. Review issues above');
    console.log('2. Check Render dashboard → Environment variables');
    console.log('3. Verify database is running');
    console.log('4. Check service logs for errors');
  }
}

// Check if YAML parser is available
try {
  await import('yaml');
} catch {
  console.error('Error: yaml package not found');
  console.error('This script is meant to be run in the Render environment or after npm install');
  console.error('Alternatively, manually review render.yaml for:');
  console.error('  - All services have healthCheckPath (for web services)');
  console.error('  - DATABASE_URL is linked to sentinel-grid-db');
  console.error('  - All sync: false variables are set in Render dashboard');
  process.exit(1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
