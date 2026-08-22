/**
 * Alert Storm Suppression & Root-Cause Incident Verification Runner
 */

import {
  digitalTwinDependencyGraph,
  alertIncidentRepository,
  alertStormSuppressorService,
  incidentRecoveryService,
} from "../../src/incidents/index.js";
import { app } from "../../src/app.js";

async function runAlertStormSuppressionTests() {
  console.log("================================================================================");
  console.log("  ALERT STORM SUPPRESSION & ROOT-CAUSE INCIDENT - VERIFICATION RUNNER");
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
  digitalTwinDependencyGraph.clear();
  alertIncidentRepository.clear();

  // Suite 1: Digital Twin Topology & Dependency Traversal
  console.log("Suite 1: Digital Twin Topology & Dependency Traversal");
  const blast = digitalTwinDependencyGraph.calculateBlastRadius("router-branch-178");
  assert(blast.directRecorders >= 1, "Digital Twin tracks 1 direct NVR under branch router");
  assert(blast.dependentCameras === 16, "Digital Twin tracks 16 dependent cameras under NVR");
  assert(blast.dependentAiPipelines === 16, "Digital Twin tracks 16 dependent AI analytics pipelines");

  // Suite 2: Upstream Root-Cause Incident Creation
  console.log("\nSuite 2: Upstream Root-Cause Incident Creation");
  const routerAlert: any = {
    id: "alert-router-offline-01",
    tenantId: "bank-corp",
    branchId: "branch-178",
    branchName: "Aluva Main Branch",
    sourceNodeId: "router-branch-178",
    alertType: "INTRUSION", // or NETWORK_OUTAGE
    severity: "P1",
    title: "Branch WAN Router Offline",
    description: "Heartbeat ping failed to branch router",
    occurredAt: new Date(),
  };

  const rootRes = await alertStormSuppressorService.processAlert(routerAlert);
  assert(rootRes.incident !== undefined, "Created root-cause AlertIncident for router failure");
  assert(rootRes.incident?.category === "CONNECTIVITY_OUTAGE", "Incident category is CONNECTIVITY_OUTAGE");
  assert(rootRes.incident?.status === "OPEN", "Incident status is OPEN");
  assert(routerAlert.suppressionStatus === "ROOT_CAUSE", "Router alert marked as ROOT_CAUSE");

  // Suite 3: Downstream Cascading Alert Storm Suppression (48 alerts -> 0 independent alarms)
  console.log("\nSuite 3: Downstream Cascading Alert Storm Suppression");
  let suppressedCount = 0;

  // 16 Camera offline alerts
  for (let i = 1; i <= 16; i++) {
    const camId = `cam-178-${i.toString().padStart(2, "0")}`;
    const camAlert: any = {
      id: `alert-cam-offline-${i}`,
      tenantId: "bank-corp",
      branchId: "branch-178",
      branchName: "Aluva Main Branch",
      sourceNodeId: camId,
      cameraId: camId,
      alertType: "CAMERA_HEALTH_FAULT",
      severity: "P2",
      title: `Camera ${camId} Offline`,
      description: "RTSP ping failed",
      occurredAt: new Date(),
    };

    const res = await alertStormSuppressorService.processAlert(camAlert);
    if (res.alert.isSuppressed) suppressedCount++;
    assert(res.alert.isSuppressed === true, `Camera ${i} alert suppressed under router root cause`);
    assert((res.alert as any).suppressionReason === "UPSTREAM_NETWORK_FAILURE", "Suppression reason is UPSTREAM_NETWORK_FAILURE");
    assert((res.alert as any).incidentId === rootRes.incident?.id, "Linked to router root incident");
  }

  // 16 Recording alerts + 16 AI alerts
  for (let i = 1; i <= 16; i++) {
    const camId = `cam-178-${i.toString().padStart(2, "0")}`;
    const recAlert: any = {
      id: `alert-recording-stopped-${i}`,
      tenantId: "bank-corp",
      branchId: "branch-178",
      sourceNodeId: camId,
      cameraId: camId,
      alertType: "CAMERA_HEALTH_FAULT",
      severity: "P2",
      occurredAt: new Date(),
    };
    const rRes = await alertStormSuppressorService.processAlert(recAlert);
    if (rRes.alert.isSuppressed) suppressedCount++;

    const aiAlert: any = {
      id: `alert-ai-stream-lost-${i}`,
      tenantId: "bank-corp",
      branchId: "branch-178",
      sourceNodeId: `ai-${camId}`,
      cameraId: camId,
      alertType: "CAMERA_HEALTH_FAULT",
      severity: "P3",
      occurredAt: new Date(),
    };
    const aRes = await alertStormSuppressorService.processAlert(aiAlert);
    if (aRes.alert.isSuppressed) suppressedCount++;
  }

  assert(suppressedCount === 48, "Suppressed all 48 downstream cascading alerts during router failure");
  const activeInc = await alertIncidentRepository.findById(rootRes.incident!.id);
  assert(activeInc?.suppressedAlertCount === 48, "Incident tracks exactly 48 suppressed child alerts");

  // Suite 4: Never-Suppress Safety Policy (Physical security never hidden)
  console.log("\nSuite 4: Never-Suppress Safety Policy");
  const vaultTamperAlert: any = {
    id: "alert-vault-tamper-during-outage",
    tenantId: "bank-corp",
    branchId: "branch-178",
    sourceNodeId: "cam-178-04",
    cameraId: "cam-178-04",
    alertType: "VAULT_ACCESS",
    severity: "P1",
    title: "Unauthorized Vault Tamper Attempt",
    occurredAt: new Date(),
  };

  const vaultRes = await alertStormSuppressorService.processAlert(vaultTamperAlert);
  assert(vaultRes.alert.isSuppressed === false, "Critical VAULT_ACCESS alert is NEVER suppressed under infrastructure failure");
  assert((vaultRes.alert as any).suppressionStatus === "NONE", "Suppression status remains NONE for physical security threats");

  // Suite 5: Reversible Suppression & Recovery Re-evaluation
  console.log("\nSuite 5: Reversible Suppression & Recovery Re-evaluation");
  // Router comes back online, but CAM-07 has an independent hardware fault
  const recoveryRes = await incidentRecoveryService.handleRootCauseRecovery(rootRes.incident!.id, ["cam-178-07"]);
  assert(recoveryRes.recoveredCount === 45, "45 child alerts cleanly resolved after router recovery");
  assert(recoveryRes.promotedCount === 3, "3 child alerts for CAM-07 PROMOTED to independent alarms");

  const resolvedInc = await alertIncidentRepository.findById(rootRes.incident!.id);
  assert(resolvedInc?.status === "RESOLVED", "Incident transitioned to RESOLVED status");

  // Suite 6: Fastify REST API Endpoints Verification
  console.log("\nSuite 6: Fastify REST API Endpoints Verification");
  await app.ready();

  const getIncResp = await app.inject({
    method: "GET",
    url: "/api/v1/incidents?branchId=branch-178",
  });
  assert(getIncResp.statusCode === 200, "GET /api/v1/incidents returns 200 OK");

  const getDetailResp = await app.inject({
    method: "GET",
    url: `/api/v1/incidents/${rootRes.incident!.id}`,
  });
  assert(getDetailResp.statusCode === 200, "GET /api/v1/incidents/:id returns 200 OK with full blast radius");
  const detailData = JSON.parse(getDetailResp.body).data;
  assert(detailData.relationships.length >= 48, "Returns complete audit trail of suppressed child alert relationships");

  const statsResp = await app.inject({
    method: "GET",
    url: "/api/v1/incidents/storm-stats",
  });
  assert(statsResp.statusCode === 200, "GET /api/v1/incidents/storm-stats returns 200 OK");
  const statsData = JSON.parse(statsResp.body).data;
  assert(statsData.totalSuppressedAlerts >= 48, "Exposes total suppressed alerts operational intelligence");

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runAlertStormSuppressionTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
