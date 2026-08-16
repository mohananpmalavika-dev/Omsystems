/**
 * Consolidated Multi-Channel Notification Subsystem - Automated Verification Runner
 */

import {
  notificationPolicyEngine,
  recipientResolver,
  notificationRenderer,
  notificationOutbox,
  notificationWorker,
  notificationService,
  notificationAcknowledgementService,
  VoiceCallbackTokens,
  type NotificationContext,
} from "../../src/notifications/index.js";
import { app } from "../../src/app.js";

async function runNotificationConsolidationTests() {
  console.log("================================================================================");
  console.log("  CONSOLIDATED NOTIFICATION SUBSYSTEM - COMPREHENSIVE VERIFICATION RUNNER");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string, extra?: unknown) {
    if (condition) {
      console.log(`  [PASS] ${description}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${description}`);
      if (extra !== undefined) console.error(`         Details:`, extra);
      failed++;
    }
  }

  // Suite 1: Policy Engine Channel Selection per Priority
  console.log("Suite 1: Policy Engine Channel Selection per Priority");
  const p1Policy = notificationPolicyEngine.evaluate({
    tenantId: "bank-corp",
    alertId: "alt-01",
    priority: "P1",
    severity: "CRITICAL",
    title: "Vault Intrusion",
    message: "Motion in cash vault",
    occurredAt: new Date(),
  });
  assert(p1Policy.channels.includes("dashboard"), "P1 includes dashboard channel");
  assert(p1Policy.channels.includes("sms"), "P1 includes SMS channel");
  assert(p1Policy.channels.includes("email"), "P1 includes email channel");
  assert(p1Policy.channels.includes("voice"), "P1 includes voice call channel");
  assert(p1Policy.repeat?.enabled === true, "P1 repeating is enabled");
  assert(p1Policy.repeat?.intervalSeconds === 15, "P1 repeats every 15s");

  const p2Policy = notificationPolicyEngine.evaluate({
    tenantId: "bank-corp",
    alertId: "alt-02",
    priority: "P2",
    severity: "HIGH",
    title: "Perimeter Alert",
    message: "Line crossing at back gate",
    occurredAt: new Date(),
  });
  assert(p2Policy.channels.includes("dashboard"), "P2 includes dashboard");
  assert(p2Policy.channels.includes("email"), "P2 includes email");
  assert(!p2Policy.channels.includes("voice"), "P2 excludes voice calls");

  const p3Policy = notificationPolicyEngine.evaluate({
    tenantId: "bank-corp",
    alertId: "alt-03",
    priority: "P3",
    severity: "MEDIUM",
    title: "Camera Loitering",
    message: "Person standing near ATM",
    occurredAt: new Date(),
  });
  assert(p3Policy.channels.length === 1 && p3Policy.channels[0] === "dashboard", "P3 is dashboard-only");

  const p4Policy = notificationPolicyEngine.evaluate({
    tenantId: "bank-corp",
    alertId: "alt-04",
    priority: "P4",
    severity: "LOW",
    title: "Night Mode Switched",
    message: "IR illuminator on",
    occurredAt: new Date(),
  });
  assert(p4Policy.channels[0] === "system_log", "P4 logs to system_log only");

  // Suite 2: Scoped Policy Inheritance Hierarchy
  console.log("\nSuite 2: Scoped Policy Inheritance Hierarchy");
  notificationPolicyEngine.registerAssignment({
    id: "assign-branch-silent",
    tenantId: "bank-corp",
    scopeType: "BRANCH",
    scopeId: "branch-silent-test",
    priority: "P1",
    channels: ["dashboard", "email"], // Voice and SMS suppressed for this branch
    priorityRank: 50,
  });

  const branchOverridePolicy = notificationPolicyEngine.evaluate({
    tenantId: "bank-corp",
    alertId: "alt-05",
    branchId: "branch-silent-test",
    priority: "P1",
    severity: "CRITICAL",
    title: "Maintenance Alarm",
    message: "Test alarm",
    occurredAt: new Date(),
  });
  assert(!branchOverridePolicy.channels.includes("voice"), "Branch override successfully suppresses voice channel");

  // Suite 3: Recipient Resolver Role-based Resolution
  console.log("\nSuite 3: Recipient Resolver Role-based Resolution");
  const recipientsP1 = await recipientResolver.resolve(
    {
      tenantId: "bank-corp",
      alertId: "alt-06",
      branchId: "branch-kochi",
      priority: "P1",
      severity: "CRITICAL",
      title: "Intrusion",
      message: "Vault alarm",
      occurredAt: new Date(),
    },
    "voice"
  );
  assert(recipientsP1.length >= 2, "P1 resolves both Branch Security Officer and Branch Manager");
  assert(recipientsP1.some((r) => r.role === "BRANCH_SECURITY_OFFICER"), "Resolves Branch Security Officer");
  assert(recipientsP1.some((r) => r.role === "BRANCH_MANAGER"), "Resolves Branch Manager");

  // Suite 4: Notification Renderer Channel Templates
  console.log("\nSuite 4: Notification Renderer Channel Templates");
  const testContext: NotificationContext = {
    tenantId: "bank-corp",
    alertId: "ALT-98314",
    branchId: "branch-kochi",
    branchName: "Kochi Main",
    cameraId: "cam-vault-04",
    cameraName: "Vault CAM 04",
    detectionType: "Intrusion detected",
    priority: "P1",
    severity: "CRITICAL",
    title: "Intrusion Alert",
    message: "Person detected in vault",
    occurredAt: new Date(),
  };

  const voiceRendered = notificationRenderer.render(testContext, "voice", recipientsP1[0]);
  assert(voiceRendered.voiceText?.includes("Critical surveillance alert"), "Voice template includes spoken intro");
  assert(voiceRendered.voiceText?.includes("Kochi Main"), "Voice template includes branch name");
  assert(voiceRendered.voiceText?.includes("Press 1 to acknowledge"), "Voice template instructs Press 1 IVR");

  const smsRendered = notificationRenderer.render(testContext, "sms", recipientsP1[0]);
  assert(smsRendered.text.length <= 160, "SMS text is bounded within 160 characters");
  assert(smsRendered.text.includes("ALT-98314"), "SMS text includes Alert ID");

  const emailRendered = notificationRenderer.render(testContext, "email", recipientsP1[0]);
  assert(emailRendered.subject?.includes("[P1]"), "Email subject contains [P1] priority tag");
  assert(emailRendered.html?.includes("Open Command Center"), "Email body includes Command Center action link");

  // Suite 5: Outbox Enqueuing & Idempotency Key Deduplication
  console.log("\nSuite 5: Outbox Enqueuing & Idempotency Key Deduplication");
  notificationOutbox.clear();

  const jobs1 = await notificationService.notifyAlert(testContext, false);
  assert(jobs1.length >= 4, "Enqueues outbox jobs across all P1 channels");

  // Attempt duplicate enqueue of the same alert
  const jobs2 = await notificationService.notifyAlert(testContext, false);
  assert(jobs2.length === jobs1.length, "Idempotency prevents duplicate outbox jobs for identical alert");

  // Suite 6: Worker Batch Processing & Provider Dispatch
  console.log("\nSuite 6: Worker Batch Processing & Provider Dispatch");
  const batchResult = await notificationWorker.processBatch();
  assert(batchResult.processed >= 4, "Worker processed all pending outbox jobs");
  assert(batchResult.succeeded >= 4, "All providers successfully accepted jobs");

  const processedJobs = notificationOutbox.getJobsByAlert("ALT-98314");
  const sentJobs = processedJobs.filter((j) => j.status === "SENT" || j.status === "DELIVERED");
  assert(sentJobs.length === processedJobs.length, "All outbox items marked SENT or DELIVERED");

  // Suite 7: IVR Press 1 Acknowledgement & Escalation Cancellation
  console.log("\nSuite 7: IVR Press 1 Acknowledgement & Escalation Cancellation");
  // Enqueue a pending escalation job
  await notificationOutbox.enqueue({
    tenantId: "bank-corp",
    alertId: "ALT-98314",
    channel: "voice",
    priority: "P1",
    destination: "+919999988888",
    payload: { text: "Escalation to Regional Head" },
    maxAttempts: 3,
    idempotencyKey: "ALT-98314:voice:escalation-02",
  });

  const ackResult = await notificationAcknowledgementService.acknowledgeFromChannel(
    "ALT-98314",
    "VOICE_IVR",
    "+919447001122"
  );
  assert(ackResult.success === true, "IVR acknowledgement succeeds");
  assert(ackResult.acknowledgedNotifications >= 4, "Marks delivered notifications as ACKNOWLEDGED");
  assert(ackResult.cancelledPendingNotifications >= 1, "Cancels pending escalation outbox items");

  // Suite 8: Multi-Provider Health Checks
  console.log("\nSuite 8: Multi-Provider Health Checks");
  const providerHealth = await notificationWorker.checkAllProviderHealth();
  assert(providerHealth.length === 6, "Checks health across all 6 registered providers");
  assert(providerHealth.every((h) => h.status === "HEALTHY"), "All providers report HEALTHY status");

  // Suite 9: Fastify REST API Endpoints Verification
  console.log("\nSuite 9: Fastify REST API Endpoints Verification");
  await app.ready();

  const dispatchResp = await app.inject({
    method: "POST",
    url: "/api/v1/notifications/dispatch",
    payload: {
      tenantId: "bank-corp",
      alertId: "ALT-REST-01",
      branchId: "branch-178",
      branchName: "Aluva",
      cameraId: "cam-01",
      cameraName: "CAM01",
      detectionType: "Intrusion",
      priority: "P1",
      title: "Aluva Intrusion Alert",
    },
  });
  assert(dispatchResp.statusCode === 201, "POST /api/v1/notifications/dispatch returns 201 Created");
  const dispatchData = JSON.parse(dispatchResp.body).data;
  assert(dispatchData.enqueuedJobs >= 4, "Enqueued P1 notifications across all channels");

  const outboxResp = await app.inject({
    method: "GET",
    url: "/api/v1/notifications/outbox?alertId=ALT-REST-01",
  });
  assert(outboxResp.statusCode === 200, "GET /api/v1/notifications/outbox returns 200 OK");
  const outboxData = JSON.parse(outboxResp.body).data;
  assert(outboxData.jobs.length >= 4, "Returns outbox items for alert ALT-REST-01");

  const healthResp = await app.inject({
    method: "GET",
    url: "/api/v1/notifications/providers/health",
  });
  assert(healthResp.statusCode === 200, "GET /api/v1/notifications/providers/health returns 200 OK");
  const healthData = JSON.parse(healthResp.body).data;
  assert(healthData.providers.length === 6, "Returns 6 provider health records");

  const tokens = new VoiceCallbackTokens("sentinel-voice-secret-key-2026");
  const signedToken = tokens.sign({
    notificationId: "notif-test-01",
    alertId: "ALT-REST-01",
    tenantId: "bank-corp",
  });

  const ivrResp = await app.inject({
    method: "GET",
    url: `/api/v1/notifications/voice/ivr?Digits=1&token=${encodeURIComponent(signedToken)}`,
  });
  assert(ivrResp.statusCode === 200, "GET /api/v1/notifications/voice/ivr handles Press 1");
  assert(ivrResp.body.includes("Alert acknowledged"), "TwiML/Asterisk response confirms alert acknowledgement");

  const deadLettersResp = await app.inject({
    method: "GET",
    url: "/api/v1/notifications/dead-letters",
  });
  assert(deadLettersResp.statusCode === 200, "GET /api/v1/notifications/dead-letters returns 200 OK");

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runNotificationConsolidationTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
