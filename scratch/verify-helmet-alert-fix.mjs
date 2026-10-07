/**
 * Verification script for helmet-worn alert fix
 * 
 * This verifies that helmet-worn detections now trigger immediate alerts,
 * bypassing the temporal filtering that was blocking them before.
 */

import { AlertCorrelationEngine } from '../analytics-engine/dist/alert-correlation.js';

console.log('Testing helmet-worn alert generation fix...\n');

const engine = new AlertCorrelationEngine({
  enableDeduplication: true,
  enableTemporalFiltering: true,
  minOccurrencesBeforeAlert: 2, // Normally requires 2 occurrences
});

const helmetDetection = {
  detectionType: "helmet-worn",
  status: "SUCCESS",
  provenance: "LIVE_INFERENCE",
  confidence: 0.85,
  durationSeconds: 1,
  objects: [
    { label: "helmet", confidence: 0.85, boundingBox: { x: 0.3, y: 0.1, width: 0.1, height: 0.1 } },
    { label: "person", confidence: 0.92, boundingBox: { x: 0.2, y: 0.1, width: 0.3, height: 0.6 } },
  ],
  metadata: { 
    compliantCount: 1, 
    threatType: "helmet_worn_inside_facility",
    evidenceSource: "confirmed-head-classification"
  },
  requiresAlert: true,
};

console.log('Processing helmet-worn detection (FIRST occurrence)...');
const alerts = await engine.processDetection(
  helmetDetection,
  "cam-entrance-101",
  "tenant-bank-xyz",
  new Date("2026-10-07T10:00:00Z")
);

console.log(`\nResult: ${alerts.length} alert(s) generated`);

if (alerts.length === 0) {
  console.error('❌ FAILED: No alert generated on first helmet-worn detection!');
  console.error('   The temporal filtering is still blocking helmet alerts.');
  process.exit(1);
}

if (alerts.length === 1) {
  const alert = alerts[0];
  console.log('✓ SUCCESS: Alert generated immediately!');
  console.log(`   Detection Type: ${alert.detectionType}`);
  console.log(`   Severity: ${alert.severity}`);
  console.log(`   Category: ${alert.category}`);
  console.log(`   Status: ${alert.status}`);
  console.log(`   Occurrences: ${alert.occurrences}`);
  console.log(`   Title: ${alert.title}`);
  
  if (alert.detectionType === 'helmet-worn' && 
      alert.severity === 'medium' &&
      alert.category === 'compliance' &&
      alert.status === 'open') {
    console.log('\n✅ ALL CHECKS PASSED!');
    console.log('   Helmet-worn alerts are now being generated immediately.');
  } else {
    console.error('\n⚠️ PARTIAL SUCCESS: Alert generated but properties unexpected');
  }
}

console.log('\n---');
console.log('Testing that other detections still respect temporal filtering...\n');

const personCountDetection = {
  detectionType: "person-counting",
  status: "SUCCESS",
  provenance: "LIVE_INFERENCE",
  confidence: 0.88,
  durationSeconds: 0,
  objects: [{ label: "person", confidence: 0.88, boundingBox: { x: 0.5, y: 0.2, width: 0.2, height: 0.5 } }],
  metadata: { count: 5 },
  requiresAlert: true,
};

const engine2 = new AlertCorrelationEngine({
  enableDeduplication: true,
  enableTemporalFiltering: true,
  minOccurrencesBeforeAlert: 2,
});

console.log('Processing person-counting detection (FIRST occurrence)...');
const personAlerts1 = await engine2.processDetection(
  personCountDetection,
  "cam-retail-303",
  "tenant-retail-abc",
  new Date("2026-10-07T10:10:00Z")
);

if (personAlerts1.length === 0) {
  console.log('✓ Temporal filtering correctly blocked first person-counting detection');
} else {
  console.error('❌ Temporal filtering did NOT block person-counting (unexpected)');
}

console.log('\nDone!');
