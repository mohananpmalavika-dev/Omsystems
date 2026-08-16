/**
 * Retention Compliance Subsystem - Comprehensive Automated Test Runner
 */

import {
  evaluateRetention,
  resolveScopedRetentionPolicy,
  DEFAULT_RETENTION_POLICY,
  type RetentionPolicy,
  type RetentionPolicyAssignment,
  archiveBoundarySearcher,
  retentionCalculatorService,
  retentionPredictionService,
  retentionEvidenceService,
  retentionPolicyService,
  retentionAlertService,
  retentionSummaryService,
  retentionReportService,
  type RetentionEvidence,
} from "../../src/retention/index.js";
import { app } from "../../src/app.js";

async function runRetentionTests() {
  console.log("================================================================================");
  console.log("  RETENTION COMPLIANCE SUBSYSTEM - COMPREHENSIVE VERIFICATION RUNNER");
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

  const policy90: RetentionPolicy = {
    requiredDays: 90,
    warningDays: 5,
    criticalDeficitDays: 15,
    unknownAfterMinutes: 60,
    minimumCoveragePercent: 98,
  };

  // Suite 1: Deterministic Policy Evaluator
  console.log("Suite 1: Deterministic Policy Evaluator & Invariant Guarantees");
  const res100 = evaluateRetention(100, 100, policy90);
  assert(res100.state === "HEALTHY", "100 / 90 evaluates to HEALTHY");
  assert(res100.complianceState === "COMPLIANT", "100 / 90 complianceState is COMPLIANT");

  const res90 = evaluateRetention(90, 100, policy90);
  assert(res90.state === "WARNING", "90 / 90 evaluates to WARNING (near threshold)");
  assert(res90.complianceState === "COMPLIANT", "90 / 90 complianceState is COMPLIANT");

  const res88 = evaluateRetention(88, 100, policy90);
  assert(res88.state === "VIOLATION", "88 / 90 evaluates to VIOLATION");
  assert(res88.complianceState === "VIOLATION", "88 / 90 complianceState is VIOLATION");

  const res61 = evaluateRetention(61, 100, policy90);
  assert(res61.state === "CRITICAL", "61 / 90 evaluates to CRITICAL (severe shortfall)");
  assert(res61.reason === "SEVERE_RETENTION_SHORTFALL", "Reason is SEVERE_RETENTION_SHORTFALL");

  // Core Invariant: Missing evidence MUST yield UNKNOWN, never HEALTHY
  const resMissing = evaluateRetention(undefined, 100, policy90, false);
  assert(resMissing.state === "UNKNOWN", "Missing evidence evaluates to UNKNOWN (Never HEALTHY)");
  assert(resMissing.complianceState === "UNKNOWN", "Missing evidence complianceState is UNKNOWN");

  // Coverage Gap Violation
  const resGap = evaluateRetention(94, 72.3, policy90);
  assert(resGap.state === "VIOLATION", "94 days with 72.3% coverage (<98%) evaluates to VIOLATION");
  assert(resGap.reason === "RECORDING_GAPS", "Reason is RECORDING_GAPS");

  // Suite 2: Recording Window & Continuity Calculation
  console.log("\nSuite 2: Recording Window & Continuity Calculation");
  const now = new Date();
  const oldest = new Date(now.getTime() - 90 * 86_400_000);
  const newestStopped = new Date(now.getTime() - 3 * 86_400_000);

  const windowStopped = retentionCalculatorService.calculateRecordingWindow(oldest, newestStopped, now);
  assert(windowStopped.archiveSpanDays === 87, "Archive span is 87 days");
  assert(windowStopped.latestRecordingAgeMinutes >= 4300, "Identifies stopped recording (latest recording age > 3 days)");

  const coverageResult = retentionCalculatorService.calculateCoverage(
    [
      { startTime: new Date(now.getTime() - 90 * 86400000), endTime: new Date(now.getTime() - 40 * 86400000) },
      { startTime: new Date(now.getTime() - 30 * 86400000), endTime: now },
    ],
    new Date(now.getTime() - 90 * 86400000),
    now
  );
  assert(coverageResult.gaps.length === 1, "Detects 1 major recording gap");
  assert(coverageResult.gaps[0].durationMinutes >= 14000, "Calculates gap duration (10 days = 14400m)");
  assert(coverageResult.coveragePercent < 90, "Coverage percent is below 90%");

  // Suite 3: Archive Boundary Binary Search Engine
  console.log("\nSuite 3: Archive Boundary Binary Search Engine");
  const boundaryTarget = {
    async searchRecordings(channelId: string, from: Date, to: Date) {
      // Simulate archive existing between (now - 61.4 days) and now
      const archiveStart = new Date(now.getTime() - 61.4 * 86400000);
      if (to >= archiveStart) {
        return [{ startTime: archiveStart, endTime: now }];
      }
      return [];
    },
  };

  const boundary = await archiveBoundarySearcher.findRetentionBoundary(boundaryTarget, "ch-1", now, 365);
  assert(boundary.oldestRecordingAt !== undefined, "Boundary search successfully locates oldest archive");
  const diffDays = Math.abs((now.getTime() - boundary.oldestRecordingAt!.getTime()) / 86400000 - 61.4);
  assert(diffDays < 1.0, "Boundary matches 61.4 days within 1-day probe tolerance");
  assert(boundary.probesExecuted <= 12, "Locates boundary in <= 12 probes (logarithmic efficiency)");

  // Suite 4: Predictive Storage Risk & Forecasting
  console.log("\nSuite 4: Predictive Storage Risk & Forecasting (Compliance vs Risk Separation)");
  const prediction = retentionPredictionService.predict({
    totalBytes: 16 * 1024 * 1024 * 1024 * 1024,
    freeBytes: 380 * 1024 * 1024 * 1024, // 380 GB free
    dailyWriteRateBytes: 190 * 1024 * 1024 * 1024, // 190 GB/day
    currentActualRetentionDays: 92.0,
    requiredRetentionDays: 90,
  });

  assert(prediction.projectedRetentionDays! < 90, "Calculates projected steady retention below required");
  assert(prediction.riskState === "AT_RISK" || prediction.riskState === "IMMINENT", "Evaluates riskState to AT_RISK/IMMINENT");
  assert(prediction.daysUntilPolicyViolation !== undefined && prediction.daysUntilPolicyViolation <= 4, "Predicts violation in <= 4 days");

  // Suite 5: Multi-Source Evidence Conflict Resolution
  console.log("\nSuite 5: Multi-Source Evidence Conflict Resolution");
  const evRecorder: RetentionEvidence = {
    id: "ev-1",
    tenantId: "t1",
    branchId: "b1",
    recorderId: "rec-1",
    source: "RECORDER_ARCHIVE",
    quality: "PLAYBACK_CONFIRMED",
    oldestRecordingAt: new Date(now.getTime() - 61.4 * 86400000),
    newestRecordingAt: now,
    observedAt: now,
    confidence: 0.98,
  };

  const evPlatformConflicting: RetentionEvidence = {
    id: "ev-2",
    tenantId: "t1",
    branchId: "b1",
    recorderId: "rec-1",
    source: "PLATFORM_INDEX",
    quality: "INDEX_ONLY",
    oldestRecordingAt: new Date(now.getTime() - 93.0 * 86400000),
    newestRecordingAt: now,
    observedAt: now,
    confidence: 0.92,
  };

  const agreement = retentionEvidenceService.evaluateAgreement([evRecorder, evPlatformConflicting]);
  assert(agreement.agreement === "CONFLICTING", "Identifies 93d vs 61.4d as CONFLICTING evidence");
  assert(agreement.effectiveConfidence <= 0.5, "Reduces confidence to <= 0.5 on conflict");

  // Suite 6: Scoped Policy Inheritance Hierarchy
  console.log("\nSuite 6: Scoped Policy Inheritance Hierarchy");
  const assignments: RetentionPolicyAssignment[] = [
    {
      id: "pol-tenant",
      tenantId: "bank-corp",
      scopeType: "TENANT",
      scopeId: "bank-corp",
      requiredRetentionDays: 60,
      priority: 0,
      effectiveFrom: new Date(),
    },
    {
      id: "pol-branch",
      tenantId: "bank-corp",
      scopeType: "BRANCH",
      scopeId: "branch-178",
      requiredRetentionDays: 90,
      priority: 40,
      effectiveFrom: new Date(),
    },
    {
      id: "pol-vault",
      tenantId: "bank-corp",
      scopeType: "CAMERA",
      scopeId: "cam-vault-01",
      requiredRetentionDays: 365,
      priority: 100,
      effectiveFrom: new Date(),
    },
  ];

  const policyGeneral = resolveScopedRetentionPolicy({ tenantId: "bank-corp", branchId: "branch-178" }, assignments);
  assert(policyGeneral.requiredDays === 90, "Branch inherits 90-day branch policy");

  const policyVault = resolveScopedRetentionPolicy(
    { tenantId: "bank-corp", branchId: "branch-178", cameraId: "cam-vault-01" },
    assignments
  );
  assert(policyVault.requiredDays === 365, "Vault camera override resolves to 365 days");

  // Suite 7: Branch & Fleet Aggregation (No Averaging Invariant)
  console.log("\nSuite 7: Branch & Fleet Aggregation (No Averaging Invariant)");
  const branchSummary = retentionSummaryService.summarizeBranch(
    "branch-demo",
    "Demo Branch",
    [
      {
        id: "a1",
        tenantId: "t1",
        branchId: "b1",
        recorderId: "r1",
        requiredRetentionDays: 90,
        actualRetentionDays: 110,
        state: "HEALTHY",
        complianceState: "COMPLIANT",
        riskState: "STABLE",
        reason: "MEETS_POLICY",
        confidence: 0.98,
        evidenceAgreement: "AGREED",
        evaluatedAt: now,
        evidenceIds: [],
      },
      {
        id: "a2",
        tenantId: "t1",
        branchId: "b1",
        recorderId: "r1",
        requiredRetentionDays: 90,
        actualRetentionDays: 110,
        state: "HEALTHY",
        complianceState: "COMPLIANT",
        riskState: "STABLE",
        reason: "MEETS_POLICY",
        confidence: 0.98,
        evidenceAgreement: "AGREED",
        evaluatedAt: now,
        evidenceIds: [],
      },
      {
        id: "a3",
        tenantId: "t1",
        branchId: "b1",
        recorderId: "r1",
        requiredRetentionDays: 90,
        actualRetentionDays: 40,
        state: "CRITICAL",
        complianceState: "VIOLATION",
        riskState: "IMMINENT",
        reason: "SEVERE_RETENTION_SHORTFALL",
        confidence: 0.98,
        evidenceAgreement: "AGREED",
        evaluatedAt: now,
        evidenceIds: [],
      },
    ],
    90
  );

  assert(branchSummary.state === "CRITICAL", "Branch state is CRITICAL due to worst-case dominance");
  assert(branchSummary.worstRetentionDays === 40, "Tracks worst actual retention (40 days, not average 86.7d)");

  // Suite 8: State Transition Alert Lifecycle
  console.log("\nSuite 8: State Transition Alert Lifecycle");
  const alert1 = retentionAlertService.handleTransition({
    id: "a-alert",
    tenantId: "t1",
    branchId: "branch-178",
    recorderId: "rec-1",
    cameraId: "cam-08",
    cameraName: "CAM08",
    requiredRetentionDays: 90,
    actualRetentionDays: 61.4,
    state: "CRITICAL",
    complianceState: "VIOLATION",
    riskState: "IMMINENT",
    reason: "SEVERE_RETENTION_SHORTFALL",
    confidence: 0.98,
    evidenceAgreement: "AGREED",
    evaluatedAt: now,
    evidenceIds: [],
  });

  assert(alert1 !== null, "Emits alert on HEALTHY -> CRITICAL transition");
  assert(alert1?.severity === "CRITICAL", "Alert severity is CRITICAL");

  // Duplicate assessment does not spam
  const alert2 = retentionAlertService.handleTransition({
    id: "a-alert-2",
    tenantId: "t1",
    branchId: "branch-178",
    recorderId: "rec-1",
    cameraId: "cam-08",
    cameraName: "CAM08",
    requiredRetentionDays: 90,
    actualRetentionDays: 61.4,
    state: "CRITICAL",
    complianceState: "VIOLATION",
    riskState: "IMMINENT",
    reason: "SEVERE_RETENTION_SHORTFALL",
    confidence: 0.98,
    evidenceAgreement: "AGREED",
    evaluatedAt: now,
    evidenceIds: [],
  });
  assert(alert2 === null, "Suppresses alert on same state (prevents alert spam)");

  // Suite 9: REST API Endpoints Verification
  console.log("\nSuite 9: REST API Endpoints Verification");
  await app.ready();

  const overviewResp = await app.inject({
    method: "GET",
    url: "/api/v1/retention/overview",
  });
  assert(overviewResp.statusCode === 200, "GET /api/v1/retention/overview returns 200 OK");
  const overviewData = JSON.parse(overviewResp.body).data;
  assert(overviewData.totalBranches === 400, "Fleet overview tracks 400 branches");

  const branchesResp = await app.inject({
    method: "GET",
    url: "/api/v1/retention/branches?limit=10",
  });
  assert(branchesResp.statusCode === 200, "GET /api/v1/retention/branches returns 200 OK");
  const branchesData = JSON.parse(branchesResp.body).data;
  assert(branchesData.branches.length === 10, "Returns 10 branches in paginated list");

  const branchAssessResp = await app.inject({
    method: "GET",
    url: "/api/v1/branches/branch-178/retention/assessment",
  });
  assert(branchAssessResp.statusCode === 200, "GET /api/v1/branches/:branchId/retention/assessment returns 200 OK");
  const branchAssessData = JSON.parse(branchAssessResp.body).data;
  assert(branchAssessData.summary.branchId === "branch-178", "Returns assessment for branch-178");
  assert(branchAssessData.cameras.length === 16, "Returns 16 constituent camera assessments");

  const cameraEvResp = await app.inject({
    method: "GET",
    url: "/api/v1/cameras/cam-178-04/retention/evidence",
  });
  assert(cameraEvResp.statusCode === 200, "GET /api/v1/cameras/:cameraId/retention/evidence returns 200 OK");
  const cameraEvData = JSON.parse(cameraEvResp.body).data;
  assert(cameraEvData.evidence.length >= 2, "Returns multi-source evidence (Recorder + Platform)");

  const reportResp = await app.inject({
    method: "GET",
    url: "/api/v1/retention/reports/daily",
  });
  assert(reportResp.statusCode === 200, "GET /api/v1/retention/reports/daily returns 200 OK");
  const reportData = JSON.parse(reportResp.body).data;
  assert(reportData.totalBranches === 400, "Daily report covers 400 branches");
  assert(reportData.worstOffenders.length > 0, "Daily report lists worst offenders");

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runRetentionTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
