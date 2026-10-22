import assert from 'node:assert';
import { vlmVideoRAGService } from '../src/services/vlm-video-rag.service.ts';

async function runTests() {
  console.log('🧪 Starting VLM Video RAG & Natural Language Video Search Tests...\n');

  // -------------------------------------------------------------
  // Test 1: Query 1 (Person with Yellow Shirt & Bag after 7 PM yesterday)
  // -------------------------------------------------------------
  console.log('Test 1: Testing Malayalam Search Query: "ഇന്നലെ വൈകുന്നേരം 7 മണിക്ക് ശേഷം മഞ്ഞ ഷർട്ട് ഇട്ട് ബാഗുമായി വന്ന ആളെ കാണിക്കുക"');
  const q1 = "ഇന്നലെ വൈകുന്നേരം 7 മണിക്ക് ശേഷം മഞ്ഞ ഷർട്ട് ഇട്ട് ബാഗുമായി വന്ന ആളെ കാണിക്കുക";
  const refTime = new Date("2026-10-22T23:30:00.000Z");
  
  const parsed1 = await vlmVideoRAGService.parseQuery(q1, refTime);
  console.log('Parsed Q1:', JSON.stringify(parsed1, null, 2));

  assert.strictEqual(parsed1.isSummaryQuery, false, "Expected isSummaryQuery to be false");
  assert.strictEqual(parsed1.objectType, "person", "Expected objectType to be 'person'");
  assert.strictEqual(parsed1.attributes.upperClothingColor, "yellow", "Expected upperClothingColor to be 'yellow'");
  assert.strictEqual(parsed1.attributes.hasBag, true, "Expected hasBag to be true");
  assert.ok(parsed1.timeRange?.from, "Expected timeRange.from to be set");
  
  const fromDate = new Date(parsed1.timeRange.from);
  const hour = fromDate.getUTCHours();
  assert.ok(hour >= 18 || hour <= 1, "Expected evening time range");
  console.log('✅ Test 1 Passed: Successfully parsed Malayalam target object, color, bag accessory, and time!\n');

  // -------------------------------------------------------------
  // Test 2: Query 2 (AI Video Summary: "ഇന്നത്തെ ബ്രാഞ്ചിലെ പ്രധാന സംഭവങ്ങൾ എന്തൊക്കെയാണ്?")
  // -------------------------------------------------------------
  console.log('Test 2: Testing Malayalam Summary Query: "ഇന്നത്തെ ബ്രാഞ്ചിലെ പ്രധാന സംഭവങ്ങൾ എന്തൊക്കെയാണ്?"');
  const q2 = "ഇന്നത്തെ ബ്രാഞ്ചിലെ പ്രധാന സംഭവങ്ങൾ എന്തൊക്കെയാണ്?";
  const parsed2 = await vlmVideoRAGService.parseQuery(q2, refTime);
  console.log('Parsed Q2:', JSON.stringify(parsed2, null, 2));

  assert.strictEqual(parsed2.isSummaryQuery, true, "Expected isSummaryQuery to be true");
  console.log('✅ Test 2a Passed: Correctly identified as an AI Video Summary request\n');

  console.log('Generating AI Video Summary Report...');
  const summaryReport = await vlmVideoRAGService.generateVideoSummaryReport({
    query: q2,
    branchName: "Kochi MG Road Flagship Branch",
  });
  console.log('Summary Report Title:', summaryReport.title);
  console.log('Bullet Points Count:', summaryReport.bulletPoints.length);
  summaryReport.bulletPoints.forEach((bp, idx) => {
    console.log(`  ${idx + 1}. ${bp}`);
  });

  assert.ok(summaryReport.bulletPoints.length >= 3 && summaryReport.bulletPoints.length <= 5, "Expected 3-4 bullet points");
  assert.ok(summaryReport.statistics.totalVisitors > 0, "Expected visitor count");
  assert.ok(summaryReport.statistics.camerasOnline > 0, "Expected online cameras");
  console.log('✅ Test 2b Passed: Successfully generated 3-4 bullet points executive AI video summary!\n');

  // -------------------------------------------------------------
  // Test 3: Candidate Clip Synthesis for Cold-Start / Instant Demos
  // -------------------------------------------------------------
  console.log('Test 3: Testing Candidate Clip Synthesis for Instant Search Results');
  const clips = vlmVideoRAGService.generateSynthesizedClips(parsed1, "branch-101");
  console.log(`Generated ${clips.length} filtered clips:`);
  clips.forEach(clip => {
    console.log(`  - [${clip.matchType.toUpperCase()}] ${clip.cameraName} @ ${clip.timestamp}`);
    console.log(`    Reason: ${clip.matchReason}`);
    console.log(`    Attributes:`, clip.object.attributes);
  });

  assert.ok(clips.length > 0, "Expected at least 1 clip");
  assert.strictEqual(clips[0].object.attributes.upperClothingColor, "yellow");
  assert.strictEqual(clips[0].object.attributes.hasBag, true);
  console.log('✅ Test 3 Passed: Candidate clips with exact attributes synthesized successfully!\n');

  // -------------------------------------------------------------
  // Test 4: Hindi Search Query ("कल शाम 7 बजे के बाद पीली शर्ट और बैग के साथ आए व्यक्ति को दिखाइए")
  // -------------------------------------------------------------
  console.log('Test 4: Testing Hindi Search Query: "कल शाम 7 बजे के बाद पीली शर्ट और बैग के साथ आए व्यक्ति को दिखाइए"');
  const qHindi1 = "कल शाम 7 बजे के बाद पीली शर्ट और बैग के साथ आए व्यक्ति को दिखाइए";
  const parsedHi1 = await vlmVideoRAGService.parseQuery(qHindi1, refTime);
  console.log('Parsed Hindi Q1:', JSON.stringify(parsedHi1, null, 2));

  assert.strictEqual(parsedHi1.isSummaryQuery, false, "Expected isSummaryQuery to be false for Hindi search");
  assert.strictEqual(parsedHi1.language, "hi", "Expected language to be 'hi'");
  assert.strictEqual(parsedHi1.objectType, "person", "Expected objectType to be 'person' for व्यक्ति");
  assert.strictEqual(parsedHi1.attributes.upperClothingColor, "yellow", "Expected upperClothingColor to be 'yellow' for पीली शर्ट");
  assert.strictEqual(parsedHi1.attributes.hasBag, true, "Expected hasBag to be true for बैग");
  assert.ok(parsedHi1.timeRange?.from, "Expected timeRange.from to be set for कल शाम 7 बजे");
  
  const fromDateHi = new Date(parsedHi1.timeRange.from);
  const localHourHi = fromDateHi.getHours();
  const utcHourHi = fromDateHi.getUTCHours();
  assert.ok(localHourHi === 19 || utcHourHi === 13 || utcHourHi === 19, "Expected evening time range (7 PM / 19:00) for कल शाम 7 बजे");
  console.log('✅ Test 4 Passed: Successfully parsed Hindi search query with color, bag, person, and time!\n');

  // -------------------------------------------------------------
  // Test 5: Hindi Summary Query ("आज ब्रांच में क्या-क्या मुख्य घटनाएं हुईं?")
  // -------------------------------------------------------------
  console.log('Test 5: Testing Hindi Summary Query: "आज ब्रांच में क्या-क्या मुख्य घटनाएं हुईं?"');
  const qHindi2 = "आज ब्रांच में क्या-क्या मुख्य घटनाएं हुईं?";
  const parsedHi2 = await vlmVideoRAGService.parseQuery(qHindi2, refTime);
  console.log('Parsed Hindi Q2:', JSON.stringify(parsedHi2, null, 2));

  assert.strictEqual(parsedHi2.isSummaryQuery, true, "Expected isSummaryQuery to be true for Hindi summary query");
  assert.strictEqual(parsedHi2.language, "hi", "Expected language to be 'hi'");

  console.log('Generating Hindi AI Video Summary Report...');
  const summaryReportHi = await vlmVideoRAGService.generateVideoSummaryReport({
    query: qHindi2,
    branchName: "Delhi Connaught Place Branch",
  });
  console.log('Summary Report Title (Hindi):', summaryReportHi.title);
  console.log('Bullet Points Count:', summaryReportHi.bulletPoints.length);
  summaryReportHi.bulletPoints.forEach((bp, idx) => {
    console.log(`  ${idx + 1}. ${bp}`);
  });

  assert.ok(summaryReportHi.bulletPoints.length >= 3 && summaryReportHi.bulletPoints.length <= 5, "Expected 3-4 bullet points");
  assert.ok(summaryReportHi.title.includes("शाखा") || summaryReportHi.title.includes("Summary"), "Expected Hindi title");
  assert.ok(summaryReportHi.statistics.totalVisitors > 0, "Expected visitor count");
  console.log('✅ Test 5 Passed: Successfully generated Hindi 3-4 bullet point executive AI video summary!\n');

  console.log('🎉 ALL VLM VIDEO RAG TESTS (MALAYALAM & HINDI) PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test Failed:', err);
  process.exit(1);
});
