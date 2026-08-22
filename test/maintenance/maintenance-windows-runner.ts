/**
 * Maintenance Windows & Operational State Separation Runner
 */

import {
  maintenanceWindowRepository,
  maintenanceResolverService,
  MaintenanceWindow,
} from "../../src/maintenance/index.js";
import { buildApp } from "../../src/app.js";
import { MemoryStore } from "../../src/store.js";

async function runMaintenanceWindowsTests() {
  console.log("================================================================================");
  console.log("  MAINTENANCE WINDOWS & OPERATIONAL STATE SEPARATION - VERIFICATION RUNNER");
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
  maintenanceWindowRepository.clear();

  const now = new Date();
  const startsAt = new Date(now.getTime() - 30 * 60 * 1000); // 30m ago (18:00)
  const endsAt = new Date(now.getTime() + 30 * 60 * 1000);   // in 30m (19:00)

  // Suite 1: Unapproved Maintenance Window Safety
  console.log("Suite 1: Unapproved Maintenance Window Safety");
  const unapprovedWindow: MaintenanceWindow = {
    id: "mw-unapproved-01",
    tenantId: "bank-corp",
    scopeType: "DEVICE",
    branchId: "branch-118",
    deviceIds: ["dvr-118-01"],
    startsAt,
    endsAt,
    recoveryGraceSeconds: 300,
    reason: "Firmware upgrade",
    requestedByUserId: "technician-01",
    status: "SCHEDULED",
    suppressNotifications: true,
    suppressIncidentCreation: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await maintenanceWindowRepository.create(unapprovedWindow);

  const unapprovedCheck = await maintenanceResolverService.shouldSuppressAlert({
    tenantId: "bank-corp",
    branchId: "branch-118",
    deviceId: "dvr-118-01",
    alertType: "RECORDER_OFFLINE",
    observedAt: now,
  });
  assert(unapprovedCheck.suppressed === false, "Unapproved maintenance window does NOT suppress alerts");

  // Suite 2: Approved Active Maintenance & State Separation (Observed vs Effective)
  console.log("\nSuite 2: Approved Active Maintenance & State Separation");
  unapprovedWindow.approvedByUserId = "manager-01";
  unapprovedWindow.approvedAt = new Date();
  unapprovedWindow.status = "ACTIVE";
  await maintenanceWindowRepository.update(unapprovedWindow);

  const devState = await maintenanceResolverService.resolveDeviceOperationalState({
    tenantId: "bank-corp",
    branchId: "branch-118",
    deviceId: "dvr-118-01",
    observedStatus: "OFFLINE",
    observedAt: now,
  });

  assert(devState.observedStatus === "OFFLINE", "Preserves raw observedStatus: OFFLINE (evidence integrity)");
  assert(devState.effectiveStatus === "MAINTENANCE", "Resolves effectiveStatus: MAINTENANCE (planned work)");
  assert(devState.maintenance?.reason === "Firmware upgrade", "Attaches maintenance window context");

  const alertCheck = await maintenanceResolverService.shouldSuppressAlert({
    tenantId: "bank-corp",
    branchId: "branch-118",
    deviceId: "dvr-118-01",
    alertType: "RECORDER_OFFLINE",
    observedAt: now,
  });
  assert(alertCheck.suppressed === true, "Active approved maintenance suppresses P1/P2 notifications");
  assert(alertCheck.reason === "PLANNED_MAINTENANCE", "Suppression reason is PLANNED_MAINTENANCE");

  // Suite 3: Branch-Wide Maintenance Scope
  console.log("\nSuite 3: Branch-Wide Maintenance Scope");
  const branchWindow: MaintenanceWindow = {
    id: "mw-branch-scope-02",
    tenantId: "bank-corp",
    scopeType: "BRANCH",
    branchId: "branch-220",
    startsAt,
    endsAt,
    recoveryGraceSeconds: 300,
    reason: "Main Switch Replacement",
    requestedByUserId: "tech-02",
    approvedByUserId: "manager-01",
    approvedAt: new Date(),
    status: "ACTIVE",
    suppressNotifications: true,
    suppressIncidentCreation: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await maintenanceWindowRepository.create(branchWindow);

  const camCheck = await maintenanceResolverService.resolveDeviceOperationalState({
    tenantId: "bank-corp",
    branchId: "branch-220",
    deviceId: "cam-220-14",
    observedStatus: "OFFLINE",
    observedAt: now,
  });
  assert(camCheck.effectiveStatus === "MAINTENANCE", "Branch-wide maintenance covers all cameras automatically");

  // Suite 4: Maintenance Recovery Grace Period
  console.log("\nSuite 4: Maintenance Recovery Grace Period");
  // Simulating 19:03 (3 minutes after window end, within 5m grace period)
  const duringGrace = new Date(endsAt.getTime() + 3 * 60 * 1000);
  const graceState = await maintenanceResolverService.resolveDeviceOperationalState({
    tenantId: "bank-corp",
    branchId: "branch-118",
    deviceId: "dvr-118-01",
    observedStatus: "OFFLINE",
    observedAt: duringGrace,
  });
  assert(graceState.effectiveStatus === "MAINTENANCE_RECOVERY", "Device offline during grace period resolves to MAINTENANCE_RECOVERY");

  // Simulating 19:07 (7 minutes after window end, grace period expired)
  const afterGrace = new Date(endsAt.getTime() + 7 * 60 * 1000);
  const expiredState = await maintenanceResolverService.resolveDeviceOperationalState({
    tenantId: "bank-corp",
    branchId: "branch-118",
    deviceId: "dvr-118-01",
    observedStatus: "OFFLINE",
    observedAt: afterGrace,
  });
  assert(expiredState.effectiveStatus === "OFFLINE", "Device still offline after grace period promotes to OFFLINE (real incident)");

  const expiredAlert = await maintenanceResolverService.shouldSuppressAlert({
    tenantId: "bank-corp",
    branchId: "branch-118",
    deviceId: "dvr-118-01",
    alertType: "RECORDER_OFFLINE",
    observedAt: afterGrace,
  });
  assert(expiredAlert.suppressed === false, "Alerts after recovery grace period are NOT suppressed");

  // Suite 5: Never-Suppress Life-Safety Alerts
  console.log("\nSuite 5: Never-Suppress Life-Safety Alerts");
  const fireCheck = await maintenanceResolverService.shouldSuppressAlert({
    tenantId: "bank-corp",
    branchId: "branch-220",
    deviceId: "cam-220-01",
    alertType: "FIRE",
    observedAt: now,
  });
  assert(fireCheck.suppressed === false, "Critical FIRE alert is NEVER suppressed during branch maintenance");

  const vaultCheck = await maintenanceResolverService.shouldSuppressAlert({
    tenantId: "bank-corp",
    branchId: "branch-220",
    deviceId: "cam-220-04",
    alertType: "VAULT_ACCESS",
    observedAt: now,
  });
  assert(vaultCheck.suppressed === false, "Critical VAULT_ACCESS alert is NEVER suppressed during branch maintenance");

  // Suite 6: Fastify REST API Endpoints Verification
  console.log("\nSuite 6: Fastify REST API Endpoints Verification");
  const app = await buildApp(new MemoryStore());
  await app.ready();

  const headers = { "x-user-id": "user-superadmin-mgdhanyamohan" };

  const createResp = await app.inject({
    method: "POST",
    url: "/api/v1/maintenance-windows",
    headers,
    payload: {
      tenantId: "bank-corp",
      branchId: "branch-300",
      scopeType: "BRANCH",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      reason: "UPS Battery Replacement",
      requestedByUserId: "tech-03",
    },
  });
  assert(createResp.statusCode === 201, "POST /api/v1/maintenance-windows returns 201 Created");
  const createdWindow = JSON.parse(createResp.body).data;

  const approveResp = await app.inject({
    method: "POST",
    url: `/api/v1/maintenance-windows/${createdWindow.id}/approve`,
    headers,
    payload: { approvedByUserId: "manager-02" },
  });
  assert(approveResp.statusCode === 200, "POST /api/v1/maintenance-windows/:id/approve succeeds (200 OK)");

  const getActiveResp = await app.inject({
    method: "GET",
    url: "/api/v1/maintenance-windows/active/branch-300",
    headers,
  });
  assert(getActiveResp.statusCode === 200, "GET /api/v1/maintenance-windows/active/:branchId returns active window");

  const cancelResp = await app.inject({
    method: "POST",
    url: `/api/v1/maintenance-windows/${createdWindow.id}/cancel`,
    headers,
  });
  assert(cancelResp.statusCode === 200, "POST /api/v1/maintenance-windows/:id/cancel cancels window");

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runMaintenanceWindowsTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
