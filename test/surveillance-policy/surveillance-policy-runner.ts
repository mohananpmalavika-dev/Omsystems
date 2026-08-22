/**
 * Policy-Driven Surveillance SLA & Compliance - Verification Test Runner
 */

import Fastify from "fastify";
import { registerSurveillancePolicyRoutes } from "../../src/routes/surveillance-policy.routes.js";
import { surveillancePolicyResolver } from "../../src/surveillance-policy/services/surveillance-policy-resolver.service.js";
import { surveillanceComplianceEvaluator } from "../../src/surveillance-policy/services/surveillance-compliance-evaluator.service.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${name}`);
    failed++;
  }
}

async function runSurveillancePolicyTests() {
  console.log("================================================================================");
  console.log("  POLICY-DRIVEN SURVEILLANCE SLA & COMPLIANCE - VERIFICATION TEST RUNNER");
  console.log("================================================================================\n");

  const app = Fastify();
  await app.register(registerSurveillancePolicyRoutes);

  // --------------------------------------------------------------------------
  // Suite 1: Hierarchical Policy Inheritance & Precedence Resolution
  // --------------------------------------------------------------------------
  console.log("Suite 1: Hierarchical Policy Inheritance & Precedence Resolution");

  const tenantId = "omsystems";

  // 1. Branch BR-118 override: 180 days retention
  await surveillancePolicyResolver.assignPolicy({
    tenantId,
    scopeType: "BRANCH",
    scopeId: "BR-118",
    overrides: {
      retentionDays: 180,
    },
    priority: 10,
    enabled: true,
  });

  // 2. Device Type VAULT_CAMERA override: 99.99% availability, 10s max recording gap
  await surveillancePolicyResolver.assignPolicy({
    tenantId,
    scopeType: "DEVICE_TYPE",
    scopeId: "VAULT_CAMERA",
    overrides: {
      cameraAvailabilityTarget: 99.99,
      maxRecordingGapSeconds: 10,
    },
    priority: 20,
    enabled: true,
  });

  // 3. Individual Device CAM-VAULT-03 override: 2s time drift tolerance
  await surveillancePolicyResolver.assignPolicy({
    tenantId,
    scopeType: "DEVICE",
    scopeId: "CAM-VAULT-03",
    overrides: {
      timeDriftToleranceSeconds: 2,
    },
    priority: 30,
    enabled: true,
  });

  // Resolve effective policy for CAM-VAULT-03
  const resolved = await surveillancePolicyResolver.resolveEffectivePolicy({
    tenantId,
    branchId: "BR-118",
    deviceId: "CAM-VAULT-03",
    deviceType: "VAULT_CAMERA",
  });

  assert(resolved.retentionDays === 180, "Resolves retentionDays = 180 from Branch override");
  assert(resolved.provenance.retentionDays.sourceScope === "BRANCH", "Provenance tracks retentionDays to BRANCH scope");

  assert(resolved.cameraAvailabilityTarget === 99.99, "Resolves cameraAvailabilityTarget = 99.99 from DeviceType override");
  assert(resolved.provenance.cameraAvailabilityTarget.sourceScope === "DEVICE_TYPE", "Provenance tracks availability to DEVICE_TYPE");

  assert(resolved.maxRecordingGapSeconds === 10, "Resolves maxRecordingGapSeconds = 10 from DeviceType override");

  assert(resolved.timeDriftToleranceSeconds === 2, "Resolves timeDriftToleranceSeconds = 2 from Device override");
  assert(resolved.provenance.timeDriftToleranceSeconds.sourceScope === "DEVICE", "Provenance tracks time drift to DEVICE");

  assert(resolved.recorderHeartbeatSeconds === 30, "Inherits recorderHeartbeatSeconds = 30 from Tenant base policy");
  assert(resolved.provenance.recorderHeartbeatSeconds.sourceScope === "TENANT", "Provenance tracks heartbeat to TENANT base");

  // --------------------------------------------------------------------------
  // Suite 2: Discrete Rule Compliance Evaluators
  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Discrete Rule Compliance Evaluators");

  // 1. Retention evaluation
  const standardPolicy = await surveillancePolicyResolver.resolveEffectivePolicy({ tenantId, branchId: "BR-001" });
  const retCompliant = surveillanceComplianceEvaluator.evaluateRetention(92.7, standardPolicy);
  assert(retCompliant.status === "COMPLIANT", "Retention 92.7d on 90d policy is COMPLIANT");

  const retNonCompliant = surveillanceComplianceEvaluator.evaluateRetention(92.7, resolved);
  assert(retNonCompliant.status === "NON_COMPLIANT", "Retention 92.7d on 180d policy is NON_COMPLIANT");
  assert(retNonCompliant.difference === -87.3, "Calculates accurate retention shortfall (-87.3d)");

  const retUnknown = surveillanceComplianceEvaluator.evaluateRetention(undefined, standardPolicy);
  assert(retUnknown.status === "UNKNOWN", "Missing retention telemetry returns UNKNOWN (not false compliant)");

  // 2. Recording required
  const recStopped = surveillanceComplianceEvaluator.evaluateRecordingRequired(false, standardPolicy);
  assert(recStopped.status === "NON_COMPLIANT", "Stopped recording evaluates to NON_COMPLIANT");

  const recActive = surveillanceComplianceEvaluator.evaluateRecordingRequired(true, standardPolicy);
  assert(recActive.status === "COMPLIANT", "Active recording evaluates to COMPLIANT");

  // 3. Recording continuity gap
  const gapNonComp = surveillanceComplianceEvaluator.evaluateRecordingGap(84, standardPolicy);
  assert(gapNonComp.status === "NON_COMPLIANT", "Gap 84s on 60s max allowed is NON_COMPLIANT");

  const gapComp = surveillanceComplianceEvaluator.evaluateRecordingGap(18, standardPolicy);
  assert(gapComp.status === "COMPLIANT", "Gap 18s on 60s max allowed is COMPLIANT");

  // 4. Time drift
  const driftWarning = surveillanceComplianceEvaluator.evaluateTimeDrift(8.4, standardPolicy);
  assert(driftWarning.status === "WARNING", "Drift 8.4s on 5s tolerance evaluates to WARNING");

  const driftCritical = surveillanceComplianceEvaluator.evaluateTimeDrift(37.0, standardPolicy);
  assert(driftCritical.status === "NON_COMPLIANT", "Drift 37.0s on 30s critical limit evaluates to NON_COMPLIANT");

  // 5. Storage disk free
  const diskWarning = surveillanceComplianceEvaluator.evaluateDiskFree(12.4, standardPolicy);
  assert(diskWarning.status === "WARNING", "Disk free 12.4% on 15% threshold evaluates to WARNING");

  const diskCritical = surveillanceComplianceEvaluator.evaluateDiskFree(4.1, standardPolicy);
  assert(diskCritical.status === "NON_COMPLIANT", "Disk free 4.1% on 5% threshold evaluates to NON_COMPLIANT");

  // 6. Availability & Maintenance Window Exclusion
  const availComp = surveillanceComplianceEvaluator.evaluateCameraAvailability(99.82, standardPolicy);
  assert(availComp.status === "COMPLIANT", "Availability 99.82% on 99.5% target is COMPLIANT");

  const availMaint = surveillanceComplianceEvaluator.evaluateCameraAvailability(85.0, standardPolicy, true);
  assert(availMaint.status === "MAINTENANCE_EXCLUDED", "Offline camera inside active maintenance window is MAINTENANCE_EXCLUDED");

  // --------------------------------------------------------------------------
  // Suite 3: Branch-Level Aggregate Compliance Report
  // --------------------------------------------------------------------------
  console.log("\nSuite 3: Branch-Level Aggregate Compliance Report");

  const branchEvalData = {
    branchId: "BR-118",
    branchName: "Branch 118 Thrissur",
    recorders: [
      {
        recorderId: "DVR-01",
        branchId: "BR-118",
        online: true,
        recording: true,
        retentionDaysObserved: 185.0,
        maxRecordingGapSeconds: 8,
        diskFreePercent: 24.5,
        timeDriftSeconds: 1.2,
      },
      {
        recorderId: "DVR-02",
        branchId: "BR-118",
        online: true,
        recording: true,
        retentionDaysObserved: 190.0,
        maxRecordingGapSeconds: 12,
        diskFreePercent: 4.1, // Critical storage violation
        timeDriftSeconds: 0.8,
      },
    ],
    cameras: [
      {
        cameraId: "CAM-01",
        branchId: "BR-118",
        online: true,
        recording: true,
        retentionDaysObserved: 185.0,
        maxRecordingGapSeconds: 5,
        timeDriftSeconds: 1.0,
        availabilityPercent: 99.95,
      },
      {
        cameraId: "CAM-18",
        branchId: "BR-118",
        online: true,
        recording: true,
        retentionDaysObserved: 185.0,
        maxRecordingGapSeconds: 147, // Recording gap violation
        timeDriftSeconds: 1.5,
        availabilityPercent: 99.80,
      },
    ],
  };

  const branchReport = surveillanceComplianceEvaluator.evaluateBranch(branchEvalData, resolved);

  assert(branchReport.status === "NON_COMPLIANT", "Branch overall status is NON_COMPLIANT due to critical violations");
  assert(branchReport.criticalViolations.length >= 2, "Identifies critical violations (DVR-02 disk, CAM-18 gap)");
  assert(branchReport.ruleSummaries.RETENTION.compliancePercent === 100, "Retention rule summary is 100% compliant");
  assert(branchReport.summary.totalEvaluations > 0, "Reports total evaluations count");

  // --------------------------------------------------------------------------
  // Suite 4: Backend REST Control-Plane Routes
  // --------------------------------------------------------------------------
  console.log("\nSuite 4: Backend REST Control-Plane Routes");

  // 1. List policies
  const listRes = await app.inject({
    method: "GET",
    url: "/v1/surveillance-policies",
  });
  assert(listRes.statusCode === 200, "GET /v1/surveillance-policies returns 200 OK");
  const listData = JSON.parse(listRes.body);
  assert(listData.data.length >= 1, "Returns at least default policy");

  // 2. Get Branch effective policy
  const branchPolicyRes = await app.inject({
    method: "GET",
    url: "/v1/branches/BR-118/surveillance-policy",
  });
  assert(branchPolicyRes.statusCode === 200, "GET /v1/branches/:branchId/surveillance-policy returns 200 OK");
  const branchPolicyData = JSON.parse(branchPolicyRes.body);
  assert(branchPolicyData.data.retentionDays === 180, "Branch policy returns resolved retentionDays: 180");
  assert(branchPolicyData.data.provenance.retentionDays.sourceScope === "BRANCH", "Returns provenance in API payload");

  // 3. Evaluate device via REST
  const devEvalRes = await app.inject({
    method: "POST",
    url: "/v1/compliance/evaluate/device",
    payload: {
      tenantId: "omsystems",
      branchId: "BR-118",
      deviceId: "CAM-VAULT-03",
      deviceType: "CAMERA",
      observation: {
        online: true,
        recording: true,
        retentionDaysObserved: 182.0,
        maxRecordingGapSeconds: 6,
        timeDriftSeconds: 1.1,
        availabilityPercent: 99.99,
      },
    },
  });
  assert(devEvalRes.statusCode === 200, "POST /v1/compliance/evaluate/device returns 200 OK");
  const devEvalData = JSON.parse(devEvalRes.body);
  assert(devEvalData.data.overallStatus === "COMPLIANT", "Device evaluates as COMPLIANT against custom vault policy");

  // 4. Evaluate branch via REST
  const brEvalRes = await app.inject({
    method: "POST",
    url: "/v1/compliance/evaluate/branch",
    payload: {
      tenantId: "omsystems",
      branchId: "BR-118",
      recorders: branchEvalData.recorders,
      cameras: branchEvalData.cameras,
    },
  });
  assert(brEvalRes.statusCode === 200, "POST /v1/compliance/evaluate/branch returns 200 OK");
  const brEvalData = JSON.parse(brEvalRes.body);
  assert(brEvalData.data.summary.compliantCount > 0, "Branch evaluation calculates compliant count");

  // --------------------------------------------------------------------------
  // Final Summary
  // --------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runSurveillancePolicyTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
