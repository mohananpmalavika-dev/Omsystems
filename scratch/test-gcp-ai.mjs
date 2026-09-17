import('./dist/src/services/guardian-ai-assistant.service.js').then(async (m) => {
  const s = new m.GuardianAIAssistant(null);
  console.log('[TEST] Initialized endpoint:', s.openAIBaseUrl, 'model:', s.model);
  const r = await s.processMessage("test-sess-1", "Show me camera status", { userId: "00000000-0000-0000-0000-000000000000", tenantId: "00000000-0000-0000-0000-000000000000" });
  console.log("[TEST RESULT MESSAGE]:", r.message);
  console.log("[TEST RESULT TYPE]:", r.type);
}).catch(console.error);
