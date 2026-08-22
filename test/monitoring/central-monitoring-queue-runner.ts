/**
 * Central Monitoring Queue & Horizontal Scalability Verification Runner
 */

import {
  surveillanceEventRepository,
  eventOutboxRepository,
  eventOutboxWorker,
} from "../../src/events/index.js";
import {
  durableAlertRepository,
  redisMonitoringQueue,
  centralMonitoringStationService,
  MonitoringWorker,
  monitoringReconciliationWorker,
  AlertPriorityService,
} from "../../src/monitoring/index.js";
import { app } from "../../src/app.js";

async function runCentralMonitoringQueueTests() {
  console.log("================================================================================");
  console.log("  CENTRAL MONITORING QUEUE & HORIZONTAL SCALABILITY - VERIFICATION RUNNER");
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

  // Clear state for clean run
  surveillanceEventRepository.clear();
  eventOutboxRepository.clear();
  durableAlertRepository.clear();
  await redisMonitoringQueue.clear();

  // Suite 1: Event Idempotency & Durable Storage
  console.log("Suite 1: Event Idempotency & Durable Storage");
  const testEventId = "evt-vault-breach-001";
  const rawEvent = {
    eventId: testEventId,
    tenantId: "bank-corp",
    branchId: "branch-aluva-178",
    source: { type: "ANALYTICS" as const, sourceId: "ai-vault-01" },
    eventType: "VAULT_DOOR_TAMPER",
    severity: "P1" as const,
    occurredAt: new Date(Date.now() - 5000).toISOString(),
    receivedAt: new Date().toISOString(),
    cameraId: "cam-178-01",
    title: "Unauthorized Vault Tamper Attempt",
    attributes: { sensorId: "sn-9912", doorAngle: 42.5 },
    schemaVersion: 1,
  };

  // Ingest same event 5 times
  const res1 = await centralMonitoringStationService.ingestEvent(rawEvent);
  assert(res1.isDuplicate === false, "First event delivery is persisted (isDuplicate = false)");
  assert(res1.alertId !== undefined, "Generated durable alertId for P1 event");

  for (let i = 2; i <= 5; i++) {
    const resDup = await centralMonitoringStationService.ingestEvent(rawEvent);
    assert(resDup.isDuplicate === true, `Duplicate ingestion attempt ${i} dropped with isDuplicate = true`);
  }

  const storedEvent = await surveillanceEventRepository.findById(testEventId);
  assert(storedEvent !== undefined, "Retrieved event from durable repository");
  assert(storedEvent?.persistedAt !== undefined, "Event record contains persistedAt timestamp");

  // Suite 2: Transactional Outbox Pattern
  console.log("\nSuite 2: Transactional Outbox Pattern");
  const outboxBatch = await eventOutboxRepository.claimBatch(10);
  assert(outboxBatch.length >= 1, "Transactional outbox contains pending alert job");
  assert(outboxBatch[0]!.status === "PENDING", "Outbox record status is PENDING");

  const published = await eventOutboxWorker.processBatch();
  assert(published >= 1, "EventOutboxWorker published outbox batch to distributed event bus");

  const emptyOutbox = await eventOutboxRepository.claimBatch(10);
  assert(emptyOutbox.length === 0, "Outbox marked as published (no pending records left)");

  // Suite 3: Redis Priority Work Queue & Dynamic Scoring
  console.log("\nSuite 3: Redis Priority Work Queue & Dynamic Scoring");
  await redisMonitoringQueue.clear();

  // Ingest P3 event, then P2 event, then P1 event
  await centralMonitoringStationService.ingestEvent({
    eventId: "evt-retention-warn-03",
    tenantId: "bank-corp",
    branchId: "branch-aluva-178",
    source: { type: "STORAGE" as const, sourceId: "nvr-01" },
    eventType: "RETENTION_THRESHOLD_WARNING",
    severity: "P3" as const,
    occurredAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    title: "Retention nearing threshold",
    attributes: {},
    schemaVersion: 1,
  });

  await centralMonitoringStationService.ingestEvent({
    eventId: "evt-camera-offline-02",
    tenantId: "bank-corp",
    branchId: "branch-aluva-178",
    source: { type: "CAMERA" as const, sourceId: "cam-07" },
    eventType: "CAMERA_RECORDING_STOPPED",
    severity: "P2" as const,
    occurredAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    title: "Camera Stopped Recording",
    attributes: {},
    schemaVersion: 1,
  });

  await centralMonitoringStationService.ingestEvent({
    eventId: "evt-critical-intrusion-01",
    tenantId: "bank-corp",
    branchId: "branch-aluva-178",
    source: { type: "SECURITY" as const, sourceId: "pir-01" },
    eventType: "CRITICAL_INTRUSION",
    severity: "P1" as const,
    occurredAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    title: "Night-time Vault Intrusion",
    attributes: {},
    schemaVersion: 1,
  });

  // Dequeue in order of priority: P1 must be first, then P2, then P3
  const item1 = await redisMonitoringQueue.claimNext("worker-test", 30);
  assert(item1?.payload.priority! >= 1000, "First dequeued alert has P1 priority (score >= 1000)");
  assert(item1?.payload.alertId === "alert-evt-critical-intrusion-01", "P1 alert dequeued first despite arriving last");
  await item1?.acknowledge();

  const item2 = await redisMonitoringQueue.claimNext("worker-test", 30);
  assert(item2?.payload.priority === 500, "Second dequeued alert has P2 priority (score = 500)");
  await item2?.acknowledge();

  const item3 = await redisMonitoringQueue.claimNext("worker-test", 30);
  assert(item3?.payload.priority === 100, "Third dequeued alert has P3 priority (score = 100)");
  await item3?.acknowledge();

  // Suite 4: Worker Lifecycle, Consumer ACK & Visibility Timeout Reclaim
  console.log("\nSuite 4: Worker Lifecycle, Consumer ACK & Visibility Timeout Reclaim");
  await redisMonitoringQueue.enqueue({
    alertId: "alert-evt-vault-breach-001",
    tenantId: "bank-corp",
    branchId: "branch-aluva-178",
    priority: 1000,
    createdAt: new Date().toISOString(),
  });

  // Worker 1 claims but simulates crash before ACK (visibility timeout = 1 sec for test)
  const delivery1 = await redisMonitoringQueue.claimNext("worker-crashed", 1);
  assert(delivery1 !== null, "Worker 1 claimed P1 alert message");

  // Wait 1.1s for visibility timeout to expire
  await new Promise((r) => setTimeout(r, 1100));

  const reclaimed = await redisMonitoringQueue.reclaimExpired(1);
  assert(reclaimed === 1, "Reclaimed 1 expired message from crashed worker");

  // Worker 2 takes over and successfully processes
  const worker2 = new MonitoringWorker("worker-healthy");
  const processed = await worker2.processNext();
  assert(processed === true, "Worker 2 claimed and successfully processed reclaimed alert");

  // Suite 5: Optimistic Concurrency & Atomic Alert Claiming
  console.log("\nSuite 5: Optimistic Concurrency & Atomic Alert Claiming");
  const alertId = "alert-evt-vault-breach-001";

  // Operator A claims alert
  const claimA = await centralMonitoringStationService.claimAlert(alertId, "operator-alice");
  assert(claimA !== null, "Operator Alice successfully claimed alert (status = ASSIGNED)");
  assert(claimA?.assignedOperatorId === "operator-alice", "Assigned operator is Alice");

  // Operator B attempts to claim the same alert concurrently
  const claimB = await centralMonitoringStationService.claimAlert(alertId, "operator-bob");
  assert(claimB === null, "Operator Bob atomic claim rejected with null (already ASSIGNED)");

  // Optimistic version conflict on acknowledgment
  const ackSuccess = await centralMonitoringStationService.acknowledgeAlert(alertId, "operator-alice", claimA!.version);
  assert(ackSuccess !== null, "Acknowledgment with correct version succeeded");
  assert(ackSuccess?.status === "ACKNOWLEDGED", "Alert transitioned to ACKNOWLEDGED status");

  const ackConflict = await centralMonitoringStationService.acknowledgeAlert(alertId, "operator-bob", 1);
  assert(ackConflict === null, "Acknowledgment with stale version rejected (optimistic lock protected)");

  // Verify Audit Action History
  const actions = await durableAlertRepository.getActionsForAlert(alertId);
  assert(actions.some((a) => a.action === "CREATED"), "Audit trail contains CREATED record");
  assert(actions.some((a) => a.action === "CLAIMED" && a.actorId === "operator-alice"), "Audit trail contains Alice CLAIMED record");
  assert(actions.some((a) => a.action === "ACKNOWLEDGED" && a.actorId === "operator-alice"), "Audit trail contains Alice ACKNOWLEDGED record");

  // Suite 6: Reconciliation & Failover Safety Net
  console.log("\nSuite 6: Reconciliation & Failover Safety Net");
  const recon = await monitoringReconciliationWorker.reconcile();
  assert(recon !== undefined, "Reconciliation worker completed cycle cleanly");

  // Suite 7: Fastify REST API Endpoints Verification
  console.log("\nSuite 7: Fastify REST API Endpoints Verification");
  await app.ready();

  const ingestResp = await app.inject({
    method: "POST",
    url: "/api/v1/monitoring/events",
    payload: {
      eventId: `evt-rest-${Date.now()}`,
      tenantId: "bank-corp",
      branchId: "branch-aluva-178",
      source: { type: "ANALYTICS", sourceId: "ai-01" },
      eventType: "UNAUTHORIZED_ACCESS",
      severity: "P1",
      title: "Unauthorized Access Detected",
    },
  });
  assert(ingestResp.statusCode === 201, "POST /api/v1/monitoring/events returns 201 Created");
  const restAlertId = JSON.parse(ingestResp.body).data.alertId;

  const alertsResp = await app.inject({
    method: "GET",
    url: "/api/v1/monitoring/alerts?tenantId=bank-corp",
  });
  assert(alertsResp.statusCode === 200, "GET /api/v1/monitoring/alerts returns 200 OK");
  const alertsList = JSON.parse(alertsResp.body).data;
  assert(alertsList.length >= 1, "Returns active alerts queried directly from PostgreSQL");

  const claimResp = await app.inject({
    method: "POST",
    url: `/api/v1/monitoring/alerts/${restAlertId}/claim`,
    payload: { operatorId: "operator-charlie" },
  });
  assert(claimResp.statusCode === 200, "POST /api/v1/monitoring/alerts/:id/claim returns 200 OK");

  const metricsResp = await app.inject({
    method: "GET",
    url: "/api/v1/monitoring/pipeline/metrics",
  });
  assert(metricsResp.statusCode === 200, "GET /api/v1/monitoring/pipeline/metrics returns 200 OK");
  const metricsData = JSON.parse(metricsResp.body).data;
  assert(metricsData.eventsReceivedPerMin > 0, "Exposes pipeline throughput (events/min)");
  assert(metricsData.latencyP50Ms > 0, "Exposes pipeline p50 processing latency (ms)");

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runCentralMonitoringQueueTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
