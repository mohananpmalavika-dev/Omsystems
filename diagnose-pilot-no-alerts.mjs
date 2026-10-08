#!/usr/bin/env node
/**
 * Local Pilot Camera - No Alert Diagnosis
 * Identifies why helmet alerts are not being generated
 */

console.log('🔍 Local Pilot Camera - No Alert Diagnosis\n');
console.log('═'.repeat(70));

const issues = [];
const recommendations = [];

// Previous diagnosis findings
console.log('\n📋 Previous Investigation Findings');
console.log('─'.repeat(70));

console.log('\n🔴 **Channel 8 Issue (26b22c59-b492-434a-aa89-163fff620af1)**');
console.log('   Date: 2026-10-06');
console.log('   Problem: Session already disposed exception');
console.log('   Status: Runtime model session failure');
console.log('   Evidence: onnxruntime-node Session disposed error');
console.log('   Impact: Analytics engine rejecting frames with HTTP 500');
issues.push('Channel 8: ONNX runtime session disposed - needs service restart');

console.log('\n🔴 **Channel 9 Issue (e66e3498-1c13-4f59-91d7-5a3386d269d2)**');
console.log('   Date: 2026-10-07');
console.log('   Problem: Person too small/distant in frame');
console.log('   Evidence: Person confidence only 0.40-0.45 (needs ≥0.80)');
console.log('   Details: Distant person <35% frame height, head <20x20 pixels');
issues.push('Channel 9: Person too distant - fails size/confidence gates');

// Root causes
console.log('\n\n🎯 Root Causes Identified');
console.log('═'.repeat(70));

console.log('\n1️⃣ **ONNX Runtime Session Failure (Channel 8)**');
console.log('   Symptom: "Session already disposed" exception');
console.log('   Location: onnxruntime-node/dist/backend.js:117');
console.log('   Impact: All frames rejected with HTTP 500 → 502');
console.log('   Frequency: 18+ exceptions in recent logs');
console.log('   Status: Service needs restart to reload model sessions');

console.log('\n2️⃣ **Person Detection Gates (Channel 9)**');
console.log('   Required: Person confidence ≥ 0.80');
console.log('   Actual: Person confidence 0.40-0.45');
console.log('   Required: Person height ≥ 35% of frame');
console.log('   Required: Head size ≥ 20x20 pixels');
console.log('   Actual: Distant person fails all size gates');

console.log('\n3️⃣ **Frame Capture Issues**');
console.log('   Observed gap: 37.9 seconds between frames');
console.log('   Expected: More frequent capture for temporal confirmation');
console.log('   Impact: Sparse frames delay 2-3 frame confirmation');

console.log('\n4️⃣ **Analytics Input Resolution**');
console.log('   Analytics resolution: 640x360 pixels');
console.log('   HD player resolution: Higher (user sees larger image)');
console.log('   Impact: Distant persons clear in player but too small for AI');

// Solutions
console.log('\n\n✅ Solutions Required');
console.log('═'.repeat(70));

console.log('\n🔧 **Immediate Actions**');
console.log('─'.repeat(70));
console.log('1. Restart analytics engine to fix ONNX session disposal');
console.log('   Command: Restart analytics-engine service/container');
console.log('   Impact: Fixes Channel 8 HTTP 500 errors immediately');
recommendations.push('CRITICAL: Restart analytics-engine service');

console.log('\n2. Verify person is clearly visible and close to camera');
console.log('   Channel 9: Person should occupy >35% of frame height');
console.log('   Position: Within 3-5 meters of camera for 640x360 resolution');
console.log('   Duration: Stay stationary for 45+ seconds for confirmation');

console.log('\n🎯 **Configuration Improvements**');
console.log('─'.repeat(70));
console.log('1. Enable HD capture for pilot cameras');
console.log('   Add to analytics-engine/.env:');
console.log('   HELMET_HD_CAPTURE_CAMERAS=e66e3498-1c13-4f59-91d7-5a3386d269d2,26b22c59-b492-434a-aa89-163fff620af1');
console.log('   Impact: Better distant person detection');
recommendations.push('Enable HD capture for Local Pilot cameras');

console.log('\n2. Adjust camera positioning');
console.log('   Current: Entrance monitoring (people far from camera)');
console.log('   Better: Position camera closer to detection zone');
console.log('   Ideal: People should be 3-5m from camera, not 8-10m');

console.log('\n3. Increase frame submission rate');
console.log('   Current: ~30-40 second gaps observed');
console.log('   Target: 1-2 FPS for better temporal confirmation');
console.log('   Config: Check edge gateway frame rate settings');
recommendations.push('Increase frame submission rate to 1-2 FPS');

console.log('\n📊 **Detection Requirements (Current System)**');
console.log('─'.repeat(70));
console.log('✅ Person confidence: ≥ 0.80 (walking support: 0.35 for initial)');
console.log('✅ Person height: ≥ 72 pixels at 640x360 (≥20% of 360)');
console.log('✅ Head size: ≥ 20x20 pixels');
console.log('✅ Temporal confirmation: 2-3 consecutive frames');
console.log('✅ Frame interval: Ideally 1-2 seconds between frames');

console.log('\n⚠️  Current Pilot Camera Issues:');
console.log('❌ Person confidence: 0.40-0.45 (below 0.80 threshold)');
console.log('❌ Person too distant: Likely <72 pixels height');
console.log('❌ Frame gaps: 37+ seconds (too sparse for confirmation)');

console.log('\n\n🔍 Diagnostic Commands');
console.log('═'.repeat(70));
console.log('\n# Check analytics engine health');
console.log('curl http://localhost:8092/health\n');
console.log('# Check if ONNX session error persists');
console.log('tail -f analytics-engine/logs/analytics-engine.log | grep "Session"\n');
console.log('# Test helmet detection with a frame');
console.log('node analytics-engine/debug-helmet-detection.mjs --frame <path> --camera <id>\n');

console.log('\n\n📝 Action Plan');
console.log('═'.repeat(70));
console.log('\n**STEP 1: Fix Runtime Issue (Channel 8)**');
console.log('1. Restart analytics-engine service');
console.log('2. Verify health endpoint shows AI_OPERATIONAL');
console.log('3. Check logs for no more "Session disposed" errors');

console.log('\n**STEP 2: Test with Proper Conditions**');
console.log('1. Person should stand 3-5 meters from camera');
console.log('2. Person should face camera directly');
console.log('3. Stay stationary for 45-60 seconds');
console.log('4. Ensure good lighting (not backlit)');

console.log('\n**STEP 3: Enable HD Capture (Optional)**');
console.log('1. Add camera IDs to HELMET_HD_CAPTURE_CAMERAS');
console.log('2. Restart analytics-engine');
console.log('3. Test with distant person');

console.log('\n**STEP 4: Verify Frame Delivery**');
console.log('1. Check edge gateway frame submission rate');
console.log('2. Ensure consistent 1-2 FPS delivery');
console.log('3. Monitor frame cache timestamps');

console.log('\n\n📊 Summary');
console.log('═'.repeat(70));
console.log(`\n🔴 Issues Found: ${issues.length}`);
issues.forEach((issue, i) => {
  console.log(`   ${i + 1}. ${issue}`);
});

console.log(`\n✅ Recommendations: ${recommendations.length}`);
recommendations.forEach((rec, i) => {
  console.log(`   ${i + 1}. ${rec}`);
});

console.log('\n\n🎯 Expected Outcome After Fixes');
console.log('═'.repeat(70));
console.log('✅ Channel 8: Alerts should work after service restart');
console.log('✅ Channel 9: Alerts will work when person is close enough');
console.log('✅ Both: HD capture will improve distant person detection');
console.log('✅ Detection time: 4-6 seconds after person enters proper range');

console.log('\n' + '═'.repeat(70));
console.log('🔴 CRITICAL: Restart analytics-engine service immediately');
console.log('═'.repeat(70) + '\n');
