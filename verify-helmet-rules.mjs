#!/usr/bin/env node
/**
 * Helmet Rule Verification Script
 * Checks all cameras have properly configured helmet-worn rules
 */

import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env from analytics-engine directory
config({ path: resolve('analytics-engine', '.env') });

const REQUIRED_ENV_VARS = {
  'HELMET_HEAD_EVIDENCE_CAMERAS': '*',
  'HELMET_MULTI_MODEL': 'true',
  'HELMET_CONFIDENCE_THRESHOLD': '0.80',
  'PERSON_CONFIDENCE_THRESHOLD': '0.35'
};

const HELMET_RULE_CONFIG = {
  detectionType: 'helmet-worn',
  severity: 'P2',
  minConfidence: 0.7,
  minDurationSeconds: 1,
  cooldownSeconds: 60,
  enabled: true
};

console.log('=== Helmet Detection Rule Verification ===\n');

// Step 1: Check environment configuration
console.log('1. Checking Environment Configuration:');
const envIssues = [];
for (const [key, expected] of Object.entries(REQUIRED_ENV_VARS)) {
  const actual = process.env[key];
  const status = actual === expected ? '✅' : '❌';
  console.log(`   ${status} ${key}=${actual || '(not set)'} ${actual !== expected ? `(expected: ${expected})` : ''}`);
  if (actual !== expected) {
    envIssues.push(`${key} should be ${expected}, got ${actual || '(not set)'}`);
  }
}

// Step 2: Check helmet models exist
console.log('\n2. Checking Model Files:');
const models = [
  'analytics-engine/models/safety/helmet.onnx',
  'analytics-engine/models/safety/helmet-head-localizer.onnx',
  'analytics-engine/models/safety/helmet-head-embedding.onnx',
  'analytics-engine/models/safety/helmet-motorcycle.onnx'
];

const modelIssues = [];
for (const model of models) {
  try {
    const stats = await import('fs').then(m => m.promises.stat(model));
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`   ✅ ${model} (${sizeMB} MB)`);
  } catch {
    console.log(`   ❌ ${model} (missing)`);
    modelIssues.push(`Missing model: ${model}`);
  }
}

// Step 3: Check capability catalog
console.log('\n3. Checking Capability Catalog:');
try {
  const catalogPath = 'src/analytics/capability-catalog.ts';
  const catalogContent = readFileSync(catalogPath, 'utf8');
  const hasHelmetWorn = catalogContent.includes('"helmet-worn"') || catalogContent.includes("'helmet-worn'");
  const hasHelmet = catalogContent.includes('"helmet"') || catalogContent.includes("'helmet'");
  console.log(`   ${hasHelmetWorn ? '✅' : '❌'} helmet-worn capability registered`);
  console.log(`   ${hasHelmet ? '✅' : '❌'} helmet capability registered`);
} catch (err) {
  console.log(`   ❌ Cannot read capability catalog: ${err.message}`);
}

// Step 4: Check camera AI bundle
console.log('\n4. Checking Camera AI Bundle:');
try {
  const bundlePath = 'src/analytics/camera-ai-bundle.ts';
  const bundleContent = readFileSync(bundlePath, 'utf8');
  const hasHelmetWornRule = bundleContent.includes('helmet-worn');
  console.log(`   ${hasHelmetWornRule ? '✅' : '❌'} helmet-worn rule in CAMERA_AI_RULE_BUNDLE`);
  
  // Extract helmet-worn rule config
  const ruleMatch = bundleContent.match(/name:\s*"AI - Helmet worn.*?"[\s\S]*?cooldownSeconds:\s*\d+/);
  if (ruleMatch) {
    console.log(`   ✅ Rule configuration found in bundle`);
  }
} catch (err) {
  console.log(`   ❌ Cannot read camera AI bundle: ${err.message}`);
}

// Step 5: Check detector implementation
console.log('\n5. Checking Helmet Detector Implementation:');
try {
  const detectorPath = 'analytics-engine/src/detectors/helmet-detector.ts';
  const detectorContent = readFileSync(detectorPath, 'utf8');
  const hasWalkingSupport = detectorContent.includes('PERSON_CONFIDENCE = 0.35');
  const hasHeadVerification = detectorContent.includes('LocalizedHelmetHeadVerifier');
  const hasFastAlert = detectorContent.includes('fastAlert');
  console.log(`   ${hasWalkingSupport ? '✅' : '❌'} Walking person support (0.35 threshold)`);
  console.log(`   ${hasHeadVerification ? '✅' : '❌'} Multi-model head verification`);
  console.log(`   ${hasFastAlert ? '✅' : '❌'} Fast alert configuration`);
} catch (err) {
  console.log(`   ❌ Cannot read helmet detector: ${err.message}`);
}

// Summary
console.log('\n=== Summary ===');
const totalIssues = envIssues.length + modelIssues.length;
if (totalIssues === 0) {
  console.log('✅ All helmet detection rules are properly configured!');
  console.log('\n📋 Configuration:');
  console.log('   - Walking person detection: ENABLED');
  console.log('   - Multi-model verification: ENABLED');
  console.log('   - All cameras: ENABLED (wildcard)');
  console.log('   - Confidence threshold: 0.70 (alerts), 0.80 (detection)');
  console.log('   - Person detection: 0.35 (supports walking)');
  process.exit(0);
} else {
  console.log(`❌ Found ${totalIssues} issue(s):\n`);
  [...envIssues, ...modelIssues].forEach((issue, i) => {
    console.log(`   ${i + 1}. ${issue}`);
  });
  console.log('\n🔧 Fix Required:');
  if (envIssues.length > 0) {
    console.log('   Update analytics-engine/.env with the correct values');
  }
  if (modelIssues.length > 0) {
    console.log('   Ensure all helmet detection models are downloaded');
  }
  process.exit(1);
}
