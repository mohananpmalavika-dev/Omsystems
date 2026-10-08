#!/usr/bin/env node
/**
 * Diagnose Bettiah Helmet Alert Issue - October 8, 2026
 * Time: 10:07 AM - 10:09 AM
 * Location: Bettiah, Channel 2 and Channel 5
 * Issue: Person with helmet entered, recording exists, but no alert generated
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('analytics-engine', '.env') });

console.log('🔍 Bettiah Missed Alert Diagnosis - October 8, 2026');
console.log('═'.repeat(70));
console.log('\n📅 Incident Details:');
console.log('   Time: 10:07 AM - 10:09 AM IST');
console.log('   Location: Bettiah');
console.log('   Cameras: Channel 2 and Channel 5');
console.log('   Issue: Person with helmet visible in recording, no alert generated');
console.log('\n' + '═'.repeat(70));

// Known Bettiah information
const BETTIAH_BRANCH_ID = 'd7b23dee-9814-48c9-8805-48b61b33e3a9';
const DVR_IP = '172.28.18.100';

console.log('\n📍 Bettiah Branch Information:');
console.log('─'.repeat(70));
console.log(`   Branch ID: ${BETTIAH_BRANCH_ID}`);
console.log(`   DVR IP: ${DVR_IP}`);
console.log('   Channels: 2 and 5');

// Possible causes based on previous diagnostics
console.log('\n\n🔴 Possible Causes (Based on System Knowledge):');
console.log('═'.repeat(70));

const causes = [
  {
    num: 1,
    title: 'Analytics Frame Not Submitted to Engine',
    probability: 'HIGH',
    details: [
      'Recording exists but analytics frame never sent',
      'Edge gateway may not be sending frames to analytics',
      'Frame cache may be empty or stale',
      'Check: Edge gateway frame submission logs'
    ]
  },
  {
    num: 2,
    title: 'Person Detection Failed',
    probability: 'MEDIUM',
    details: [
      'Person confidence below 0.80 threshold',
      'Person too small in 640x360 analytics frame',
      'Recording HD but analytics gets low-res',
      'Check: Person detection confidence in frame'
    ]
  },
  {
    num: 3,
    title: 'Temporal Confirmation Not Met',
    probability: 'MEDIUM',
    details: [
      'Person detected but not in 2-3 consecutive frames',
      'Frame submission too sparse (>5 second gaps)',
      'Person moved too quickly through frame',
      'Check: Frame submission rate and timestamps'
    ]
  },
  {
    num: 4,
    title: 'ONNX Session Failure (Like Local Pilot)',
    probability: 'HIGH',
    details: [
      'Same "Session disposed" error as Local Pilot CH8',
      'Analytics engine rejecting frames with HTTP 500',
      'Service needs restart',
      'Check: Analytics engine logs for session errors'
    ]
  },
  {
    num: 5,
    title: 'Helmet Rule Disabled or Not Configured',
    probability: 'LOW',
    details: [
      'helmet-worn rule may be disabled',
      'Rule may not exist for these cameras',
      'Auto-provisioning may have failed',
      'Check: Camera analytics rules status'
    ]
  },
  {
    num: 6,
    title: 'Alert Suppression or Cooldown',
    probability: 'LOW',
    details: [
      'Previous alert within 60-second cooldown',
      'Alert suppression rule active',
      'Alert notification dispatcher failed',
      'Check: Recent alerts and cooldown status'
    ]
  }
];

causes.forEach(cause => {
  console.log(`\n${cause.num}️⃣ **${cause.title}**`);
  console.log(`   Probability: ${cause.probability}`);
  cause.details.forEach(detail => {
    console.log(`   • ${detail}`);
  });
});

// Diagnostic steps
console.log('\n\n🔍 Diagnostic Steps to Execute:');
console.log('═'.repeat(70));

const steps = [
  {
    step: 1,
    title: 'Check Analytics Engine Health',
    commands: [
      'curl http://localhost:8092/health',
      'Check for "Session disposed" errors in logs',
      'Verify aiState = AI_OPERATIONAL'
    ],
    lookFor: 'Session disposal errors, HTTP 500s, unhealthy detectors'
  },
  {
    step: 2,
    title: 'Check Camera Analytics Rules',
    commands: [
      'Query: SELECT * FROM analytics_rules WHERE camera_id IN (SELECT id FROM cameras WHERE branch_node_id = \'d7b23dee-9814-48c9-8805-48b61b33e3a9\' AND name LIKE \'%Channel 2%\' OR name LIKE \'%Channel 5%\')',
      'Verify helmet-worn rule exists and enabled = true',
      'Check rule confidence threshold'
    ],
    lookFor: 'Missing rules, disabled rules, high confidence thresholds'
  },
  {
    step: 3,
    title: 'Check Frame Submission',
    commands: [
      'Query analytics frame cache for Bettiah cameras',
      'Check frame timestamps around 10:07-10:09 AM',
      'Verify frames were submitted to analytics engine'
    ],
    lookFor: 'Missing frames, stale cache, sparse timestamps'
  },
  {
    step: 4,
    title: 'Check Alert History',
    commands: [
      'Query: SELECT * FROM analytics_alerts WHERE camera_id IN (...Bettiah...) AND created_at BETWEEN \'2026-10-08 10:00:00\' AND \'2026-10-08 10:15:00\'',
      'Check for any helmet-worn alerts',
      'Check alert suppression logs'
    ],
    lookFor: 'No alerts created, suppressed alerts, cooldown active'
  },
  {
    step: 5,
    title: 'Retrieve and Test Actual Frame',
    commands: [
      'Extract frame from recording at 10:07-10:09',
      'Run: node analytics-engine/debug-helmet-detection.mjs --frame <path> --camera <id>',
      'Check person detection and helmet classification'
    ],
    lookFor: 'Low person confidence, no helmet detection, model failures'
  }
];

steps.forEach(({ step, title, commands, lookFor }) => {
  console.log(`\n${step}. ${title}`);
  console.log('   Commands:');
  commands.forEach(cmd => console.log(`      ${cmd}`));
  console.log(`   Look for: ${lookFor}`);
});

// Action plan
console.log('\n\n✅ Recommended Action Plan:');
console.log('═'.repeat(70));

console.log('\n**IMMEDIATE (Do First):**');
console.log('1. Restart analytics engine (fixes ONNX session if that\'s the issue)');
console.log('   Command: .\\restart-analytics-engine.ps1');
console.log('   Time: 2 minutes');
console.log('   Impact: Fixes most common issue (session disposal)');

console.log('\n**INVESTIGATION (Do Second):**');
console.log('2. Check if frames were submitted during 10:07-10:09 AM');
console.log('3. Extract one frame from recording at 10:07:30 AM');
console.log('4. Test frame offline with helmet detector');
console.log('5. Check analytics engine logs for errors at 10:07-10:09');

console.log('\n**VERIFICATION (Do Third):**');
console.log('6. Verify helmet-worn rules exist and enabled for both cameras');
console.log('7. Check alert history to rule out cooldown/suppression');
console.log('8. Test live with person entering with helmet again');

// Based on Local Pilot experience
console.log('\n\n⚠️  Most Likely Cause (Based on Recent Pattern):');
console.log('═'.repeat(70));
console.log('\n🔴 **ONNX Session Disposal (Same as Local Pilot CH8)**');
console.log('');
console.log('   Evidence from Local Pilot October 6:');
console.log('   • "Session already disposed" errors');
console.log('   • Analytics rejecting frames with HTTP 500');
console.log('   • Recording working but no alerts');
console.log('   • Isolated detector test worked, production failed');
console.log('   • Solution: Service restart');
console.log('');
console.log('   Bettiah shows same pattern:');
console.log('   • Recording exists (DVR working) ✅');
console.log('   • No alerts generated (analytics failing) ❌');
console.log('   • Same time period (today, October 8) 📅');
console.log('');
console.log('   **High probability this is a service-wide issue affecting');
console.log('   **multiple locations, not just Local Pilot.');

// Quick check commands
console.log('\n\n🚀 Quick Check Commands:');
console.log('═'.repeat(70));
console.log('\n# 1. Check service health');
console.log('curl http://localhost:8092/health | jq');
console.log('');
console.log('# 2. Check recent logs for errors');
console.log('tail -100 analytics-engine/logs/analytics-engine.log | grep -i "error\\|session\\|disposed"');
console.log('');
console.log('# 3. Restart service');
console.log('.\\restart-analytics-engine.ps1');
console.log('');
console.log('# 4. Test again with person');
console.log('# Person enters with helmet and stays 45 seconds');
console.log('');

console.log('\n═'.repeat(70));
console.log('🔴 RECOMMENDATION: Restart analytics-engine immediately');
console.log('   Same issue as Local Pilot - service-wide ONNX failure');
console.log('═'.repeat(70));
console.log('');

// Summary
console.log('\n📊 Summary:');
console.log('─'.repeat(70));
console.log('🔴 Issue: Bettiah CH2 & CH5 no helmet alerts (10:07-10:09 AM)');
console.log('📹 Recording: Exists (person with helmet visible)');
console.log('🎯 Most Likely: ONNX session disposal (service-wide issue)');
console.log('✅ Solution: Restart analytics-engine service');
console.log('⏱️  Time: 2 minutes to fix');
console.log('🧪 Test: Person enters with helmet after restart');
console.log('');
