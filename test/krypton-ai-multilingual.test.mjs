import assert from "node:assert/strict";
import { detectLanguage, getLocalizedGuide, FEATURE_GUIDES } from "../src/services/guardian-feature-guides.js";
import { GuardianAIAssistant, KRYPTON_PRODUCT_FEATURES } from "../src/services/guardian-ai-assistant.service.js";
import { cctvKnowledgeAnswer } from "../src/services/guardian-cctv-knowledge.js";

console.log("=== KryptonAI Multilingual Test Suite ===");

// 1. Test detectLanguage
console.log("\n[Test 1] Testing language detection...");
assert.equal(detectLanguage("ഇന്നലെ വൈകുന്നേരം 7 മണിക്ക് ശേഷം മഞ്ഞ ഷർട്ട് ഇട്ട് ബാഗുമായി വന്ന ആളെ കാണിക്കുക"), "ml");
assert.equal(detectLanguage("ലൈൻ ക്രോസിംഗ് എങ്ങനെ സെറ്റ് ചെയ്യാം?"), "ml");
assert.equal(detectLanguage("features enthaanu undathil"), "ml");
assert.equal(detectLanguage("line crossing engane set cheyyam"), "ml");
assert.equal(detectLanguage("enthellam features undu"), "ml");

assert.equal(detectLanguage("KryptonVision में क्या-क्या फीचर्स हैं?"), "hi");
assert.equal(detectLanguage("लाइन क्रॉसिंग कैसे सेट करें?"), "hi");
assert.equal(detectLanguage("kya features hai batao"), "hi");
assert.equal(detectLanguage("camera kaise dekhe"), "hi");
assert.equal(detectLanguage("camera dikhao"), "hi");

assert.equal(detectLanguage("What AI features are available?"), "en");
assert.equal(detectLanguage("How do I configure face recognition?"), "en");
assert.equal(detectLanguage("Show me all cameras"), "en");
console.log("✔ detectLanguage tests passed!");

// 2. Test FEATURE_GUIDES presence & localization
console.log("\n[Test 2] Testing FEATURE_GUIDES coverage across EN, ML, HI...");
const requiredFeatures = [
  "line_crossing",
  "polygon_zone",
  "facial_recognition",
  "anpr",
  "crowd_loitering",
  "nbfc_banking",
  "ai_video_search",
  "incident_management",
  "voice_id",
  "evidence_export",
  "mis_reports",
  "fall_detection",
  "camera_tamper",
  "edge_agent",
];

for (const key of requiredFeatures) {
  const guide = FEATURE_GUIDES[key];
  assert.ok(guide, `Guide missing for ${key}`);
  assert.ok(guide.titleEn && guide.titleMl && guide.titleHi, `Titles incomplete for ${key}`);
  assert.ok(guide.guideEn && guide.guideEn.length > 50, `guideEn too short for ${key}`);
  assert.ok(guide.guideMl && guide.guideMl.length > 50, `guideMl too short for ${key}`);
  assert.ok(guide.guideHi && guide.guideHi.length > 50, `guideHi too short for ${key}`);
  assert.ok(guide.suggestionsEn.length > 0, `suggestionsEn missing for ${key}`);
  assert.ok(guide.suggestionsMl.length > 0, `suggestionsMl missing for ${key}`);
  assert.ok(guide.suggestionsHi.length > 0, `suggestionsHi missing for ${key}`);
}
console.log(`✔ All ${requiredFeatures.length} core features have complete EN, ML, HI guides and suggestions!`);

// 3. Test getLocalizedGuide
console.log("\n[Test 3] Testing getLocalizedGuide helper...");
const hiGuide = getLocalizedGuide("line_crossing", "hi");
assert.ok(hiGuide.message.includes("वर्चुअल ट्रिपवायर"));
assert.ok(hiGuide.messageHi.includes("वर्चुअल ट्रिपवायर"));
assert.ok(hiGuide.messageMl.includes("Line Crossing"));

const mlGuide = getLocalizedGuide("line_crossing", "ml");
assert.ok(mlGuide.message.includes("Line Crossing"));
assert.ok(mlGuide.messageMl.includes("Line Crossing"));

const enGuide = getLocalizedGuide("line_crossing", "en");
assert.ok(enGuide.message.includes("Virtual Tripwire"));
console.log("✔ getLocalizedGuide tests passed!");

// 4. Test KRYPTON_PRODUCT_FEATURES cards localization
console.log("\n[Test 4] Testing KRYPTON_PRODUCT_FEATURES cards...");
assert.equal(KRYPTON_PRODUCT_FEATURES.length, 12);
for (const card of KRYPTON_PRODUCT_FEATURES) {
  assert.ok(card.title, "Card missing title");
  assert.ok(card.titleMl, `Card ${card.title} missing titleMl`);
  assert.ok(card.titleHi, `Card ${card.title} missing titleHi`);
  assert.ok(card.description, `Card ${card.title} missing description`);
  assert.ok(card.descriptionMl, `Card ${card.title} missing descriptionMl`);
  assert.ok(card.descriptionHi, `Card ${card.title} missing descriptionHi`);
}
console.log("✔ All 12 product feature cards have EN, ML, and HI title and description!");

// 5. Test GuardianAIAssistant guest responses
console.log("\n[Test 5] Testing GuardianAIAssistant processGuestFallbackMessage...");
const assistant = new GuardianAIAssistant(null);

const guestCtx = {
  userId: "guest",
  role: "guest",
  tenantId: "guest",
  isGuest: true,
};

// Hindi feature query
const resHi = await assistant.processMessage("test-session", "KryptonVision में क्या-क्या फीचर्स हैं?", guestCtx);
assert.equal(resHi.type, "feature_cards");
assert.ok(resHi.message.includes("फीचर्स"));
assert.ok(resHi.messageHi && resHi.messageHi.includes("फीचर्स"));
assert.ok(resHi.suggestionsHi && resHi.suggestionsHi.length > 0);

// Malayalam feature query
const resMl = await assistant.processMessage("test-session", "ഇതിൽ എന്തെല്ലാം AI ഫീച്ചറുകൾ ഉണ്ട്?", guestCtx);
assert.equal(resMl.type, "feature_cards");
assert.ok(resMl.message.includes("ഫീച്ചറുകൾ"));
assert.ok(resMl.messageMl && resMl.messageMl.includes("ഫീച്ചറുകൾ"));
assert.ok(resMl.suggestionsMl && resMl.suggestionsMl.length > 0);

// Manglish feature query
const resManglish = await assistant.processMessage("test-session", "features enthaanu undathil", guestCtx);
assert.equal(resManglish.type, "feature_cards");

// English feature query
const resEn = await assistant.processMessage("test-session", "What AI features are available?", guestCtx);
assert.equal(resEn.type, "feature_cards");

// Hindi feature how-to guide query
const resGuideHi = await assistant.processMessage("test-session", "लाइन क्रॉसिंग कैसे सेट करें?", guestCtx);
assert.ok(/[\u0900-\u097F]/.test(resGuideHi.message), "Expected Hindi text in response");
assert.ok(resGuideHi.message.includes("Line Crossing") || resGuideHi.message.includes("ट्रिपवायर") || resGuideHi.message.includes("नियम"));

// Malayalam feature how-to guide query
const resGuideMl = await assistant.processMessage("test-session", "ലൈൻ ക്രോസിംഗ് എങ്ങനെ സെറ്റ് ചെയ്യാം?", guestCtx);
assert.ok(/[\u0D00-\u0D7F]/.test(resGuideMl.message) || resGuideMl.message.includes("Line Crossing"), "Expected Malayalam/Line Crossing in response");

// English feature how-to guide query
const resGuideEn = await assistant.processMessage("test-session", "How to set up line crossing?", guestCtx);
console.log("resGuideEn message is:", JSON.stringify(resGuideEn.message));
assert.ok(resGuideEn.message.includes("Line Crossing") || resGuideEn.message.includes("Virtual Tripwire") || resGuideEn.message.includes("tripwire"));

console.log("✔ GuardianAIAssistant processGuestFallbackMessage tests passed!");

// 6. Test CCTV Knowledge Base Multilingual answers
console.log("\n[Test 6] Testing CCTV Knowledge Base Multilingual Answers...");
const hiAns = cctvKnowledgeAnswer("ONVIF क्या है?");
assert.ok(hiAns && (hiAns.includes("ONVIF") || hiAns.includes("मानक")), "Hindi ONVIF answer missing");

const mlAns = cctvKnowledgeAnswer("RTSP എന്താണ്?");
assert.ok(mlAns && mlAns.includes("RTSP"), "Malayalam RTSP answer missing");

const enAns = cctvKnowledgeAnswer("What is ONVIF?");
assert.ok(enAns && enAns.includes("ONVIF"), "English ONVIF answer missing");

console.log("✔ CCTV Knowledge Base multilingual answers verified!");

console.log("\n==========================================");
console.log("🎉 ALL MULTILINGUAL TESTS PASSED SUCCESSFULLY!");
console.log("==========================================");
