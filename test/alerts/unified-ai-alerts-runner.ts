/**
 * Unified AI Alert & Normalized Event Model Verification Runner
 */

import {
  unifiedAiAlertService,
  alertNormalizerRegistry,
  contextualSeverityPolicyService,
  aiAlertDeduplicationService,
  aiAlertCorrelationService,
  alertPresentationService,
} from "../../src/alerts/index.js";
import { app } from "../../src/app.js";

async function runUnifiedAiAlertTests() {
  console.log("================================================================================");
  console.log("  UNIFIED AI ALERT & NORMALIZED EVENT MODEL - VERIFICATION RUNNER");
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

  // Clear state
  unifiedAiAlertService.clear();

  // Suite 1: Heterogeneous AI Detector Normalization
  console.log("Suite 1: Heterogeneous AI Detector Normalization");
  const dahuaEvt = {
    eventId: "evt-dh-01",
    tenantId: "bank-corp",
    branchId: "branch-178",
    cameraId: "cam-178-01",
    vendorSource: "DAHUA_CGI" as const,
    rawEventType: "CrossLineDetection",
    timestamp: new Date().toISOString(),
    confidence: 0.94,
    attributes: { tripwireIndex: 2 },
  };
  const dahuaRes = await unifiedAiAlertService.ingestRawAiEvent(dahuaEvt);
  assert(dahuaRes.alert.alertType === "INTRUSION", "Dahua CrossLineDetection normalized to INTRUSION");
  assert(dahuaRes.alert.vendorEventType === "CrossLineDetection", "Retained raw vendor event type");
  assert(dahuaRes.alert.vendorSource === "DAHUA_CGI", "Retained raw vendor source");

  const hikEvt = {
    eventId: "evt-hik-01",
    tenantId: "bank-corp",
    branchId: "branch-178",
    cameraId: "cam-178-04",
    vendorSource: "HIKVISION_ISAPI" as const,
    rawEventType: "tamper",
    timestamp: new Date().toISOString(),
    attributes: { maskArea: 85 },
  };
  const hikRes = await unifiedAiAlertService.ingestRawAiEvent(hikEvt);
  assert(hikRes.alert.alertType === "CAMERA_TAMPER", "Hikvision ISAPI tamper normalized to CAMERA_TAMPER");

  const yoloEvt = {
    eventId: "evt-yolo-01",
    tenantId: "bank-corp",
    branchId: "branch-178",
    cameraId: "cam-178-01",
    vendorSource: "YOLO_V8" as const,
    rawEventType: "weapon_detected",
    timestamp: new Date().toISOString(),
    confidence: 0.98,
    attributes: { weaponType: "Handgun", bbox: [120, 80, 200, 300] },
  };
  const yoloRes = await unifiedAiAlertService.ingestRawAiEvent(yoloEvt);
  assert(yoloRes.alert.alertType === "WEAPON_DETECTED", "YOLO weapon_detected normalized to WEAPON_DETECTED");
  assert(yoloRes.alert.attributes.weaponType === "Handgun", "Retained detector-specific attributes in envelope");

  const anprEvt = {
    eventId: "evt-anpr-01",
    tenantId: "bank-corp",
    branchId: "branch-178",
    cameraId: "cam-178-12",
    vendorSource: "ANPR_ENGINE" as const,
    rawEventType: "blacklisted_vehicle",
    timestamp: new Date().toISOString(),
    attributes: { licensePlate: "KL-07-CC-9988", flag: "STOLEN" },
  };
  const anprRes = await unifiedAiAlertService.ingestRawAiEvent(anprEvt);
  assert(anprRes.alert.alertType === "BLACKLIST_PERSON", "ANPR blacklisted_vehicle normalized to BLACKLIST_PERSON");

  // Suite 2: Contextual Severity Policy
  console.log("\nSuite 2: Contextual Severity Policy");
  // Weapon anywhere -> P1
  assert(yoloRes.alert.severity === "P1", "Weapon detection evaluated as P1 critical");

  // Vault intrusion -> P1
  const vaultEvt = await unifiedAiAlertService.ingestRawAiEvent({
    eventId: "evt-vault-01",
    tenantId: "bank-corp",
    branchId: "branch-178",
    cameraId: "cam-178-04", // Zone: VAULT
    vendorSource: "YOLO_V8" as const,
    rawEventType: "person_in_vault",
    timestamp: new Date().toISOString(),
  });
  assert(vaultEvt.alert.severity === "P1", "Intrusion in VAULT zone evaluated as P1 critical");
  assert(vaultEvt.alert.zone === "VAULT", "Enriched with VAULT zone classification");

  // Suite 3: High-FPS Deduplication & Flapping Suppression
  console.log("\nSuite 3: High-FPS Deduplication & Flapping Suppression");
  const continuousEvent = {
    eventId: "evt-continuous-01",
    tenantId: "bank-corp",
    branchId: "branch-178",
    cameraId: "cam-178-08", // ATM Lobby
    vendorSource: "DAHUA_CGI" as const,
    rawEventType: "RegionIntrusion",
    timestamp: new Date().toISOString(),
  };

  const initialAlert = await unifiedAiAlertService.ingestRawAiEvent(continuousEvent);
  assert(initialAlert.isDeduplicated === false, "First frame creates new alert (occurrence = 1)");

  // 10 consecutive frames within 5 seconds
  let finalAlert: any;
  for (let i = 2; i <= 10; i++) {
    const frame = await unifiedAiAlertService.ingestRawAiEvent({
      ...continuousEvent,
      eventId: `evt-continuous-${i}`,
      timestamp: new Date().toISOString(),
    });
    assert(frame.isDeduplicated === true, `Frame ${i} deduplicated cleanly`);
    finalAlert = frame.alert;
  }
  assert(finalAlert.occurrenceCount === 10, "Occurrence count incremented to 10");
  assert(finalAlert.detectorLifecycle === "UPDATE", "Lifecycle state updated to UPDATE");

  // Suite 4: Temporal Correlation & Multi-Sensor Incident Linking
  console.log("\nSuite 4: Temporal Correlation & Multi-Sensor Incident Linking");
  assert(dahuaRes.alert.correlationId !== undefined, "Alert assigned correlationId");
  assert(hikRes.alert.correlationId === dahuaRes.alert.correlationId, "Co-located alerts at same branch share correlationId");
  assert(hikRes.alert.incidentId !== undefined, "Multi-sensor alarm generated correlated incidentId");

  // Suite 5: Presentation Metadata Mapping
  console.log("\nSuite 5: Presentation Metadata Mapping");
  const firePres = alertPresentationService.getPresentation("FIRE", "P1");
  assert(firePres.soundUrgency === "P1_CRITICAL", "Fire alert has P1_CRITICAL sound urgency");
  assert(firePres.actions.includes("VIEW_LIVE") && firePres.actions.includes("ESCALATE"), "Fire alert includes VIEW_LIVE and ESCALATE action triggers");

  // Suite 6: Operator Lifecycle (Acknowledge & Escalate)
  console.log("\nSuite 6: Operator Lifecycle (Acknowledge & Escalate)");
  const ackRes = await unifiedAiAlertService.acknowledgeAlert(vaultEvt.alert.id, "operator-alice");
  assert(ackRes?.status === "ACKNOWLEDGED", "Alert transitioned to ACKNOWLEDGED");
  assert(ackRes?.acknowledgedBy === "operator-alice", "Logged operator ID in audit record");

  const escRes = await unifiedAiAlertService.escalateAlert(yoloRes.alert.id, "operator-bob", "Armed intruder spotted");
  assert(escRes?.status === "ESCALATED", "Alert transitioned to ESCALATED");
  assert(escRes?.attributes.escalatedBy === "operator-bob", "Logged escalating operator");

  // Suite 7: Fastify REST API Endpoints Verification
  console.log("\nSuite 7: Fastify REST API Endpoints Verification");
  await app.ready();

  const restIngestResp = await app.inject({
    method: "POST",
    url: "/api/v1/ai/events",
    payload: {
      eventId: `evt-rest-${Date.now()}`,
      tenantId: "bank-corp",
      branchId: "branch-178",
      cameraId: "cam-178-01",
      vendorSource: "YOLO_V8",
      rawEventType: "violence",
      timestamp: new Date().toISOString(),
    },
  });
  assert(restIngestResp.statusCode === 201, "POST /api/v1/ai/events returns 201 Created");
  const restAlert = JSON.parse(restIngestResp.body).data;
  assert(restAlert.alertType === "VIOLENCE", "Normalized to VIOLENCE");

  const getAlertsResp = await app.inject({
    method: "GET",
    url: "/api/v1/ai/alerts?branchId=branch-178",
  });
  assert(getAlertsResp.statusCode === 200, "GET /api/v1/ai/alerts returns 200 OK");
  const alertsList = JSON.parse(getAlertsResp.body).data;
  assert(alertsList.length >= 4, "Returns active normalized alerts for branch");

  const ackResp = await app.inject({
    method: "POST",
    url: `/api/v1/ai/alerts/${restAlert.id}/acknowledge`,
    payload: { operatorId: "operator-charlie" },
  });
  assert(ackResp.statusCode === 200, "POST /api/v1/ai/alerts/:id/acknowledge returns 200 OK");

  const schemaResp = await app.inject({
    method: "GET",
    url: "/api/v1/ai/alerts/presentation-metadata",
  });
  assert(schemaResp.statusCode === 200, "GET /api/v1/ai/alerts/presentation-metadata returns 200 OK");
  const schemas = JSON.parse(schemaResp.body).data;
  assert(schemas.INTRUSION !== undefined && schemas.FIRE !== undefined, "Exposes full canonical UI presentation tokens");

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runUnifiedAiAlertTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
