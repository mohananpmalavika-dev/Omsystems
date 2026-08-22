/**
 * VMS Chaos Testing & Automated Fault Injection Test Suite
 * 
 * Verifies all 13 failure modes and asserts the 6 core recovery guarantees:
 * 1. Did recording recover?
 * 2. How many seconds were lost?
 * 3. Was an alert generated?
 * 4. Did ownership transfer?
 * 5. Did the operator see the failure?
 * 6. Was the incident recorded?
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ChaosRunnerService } from "../../src/chaos-testing/services/chaos-runner.service.js";
import { ResiliencyAssessorService } from "../../src/chaos-testing/engine/resiliency-assessor.service.js";

describe("VMS Chaos Engineering & Resiliency Validation Engine", () => {
  let chaosRunner: ChaosRunnerService;
  let assessor: ResiliencyAssessorService;

  beforeEach(() => {
    chaosRunner = new ChaosRunnerService();
    assessor = new ResiliencyAssessorService();
  });

  describe("Suite 1: Recording Engine & Infrastructure Failures", () => {
    it("Scenario 1: kill recording service -> asserts process supervisor recovery & buffer drain (<2s lost)", async () => {
      const report = await chaosRunner.runExperiment({
        scenario: "KILL_RECORDING_SERVICE",
        targetId: "recorder-worker-BR-118",
        branchId: "BR-118",
      });

      expect(report.status).toBe("PASSED");
      expect(report.assertions.didRecordingRecover).toBe(true);
      expect(report.assertions.secondsLost).toBeLessThanOrEqual(2.0); // Bank SLA < 3s
      expect(report.assertions.wasAlertGenerated).toBe(true);
      expect(report.assertions.alertSeverity).toBe("P1");
      expect(report.assertions.didOwnershipTransfer).toBe(true);
      expect(report.assertions.didOperatorSeeFailure).toBe(true);
      expect(report.assertions.wasIncidentRecorded).toBe(true);
    });

    it("Scenario 2: kill Redis -> asserts in-memory circuit breaker fallback with 0s lost", async () => {
      const report = await chaosRunner.runExperiment({
        scenario: "KILL_REDIS",
        targetId: "redis-cluster-primary",
        branchId: "BR-118",
      });

      expect(report.status).toBe("PASSED");
      expect(report.assertions.didRecordingRecover).toBe(true);
      expect(report.assertions.secondsLost).toBe(0); // Redis outage does NOT stop edge video recording
      expect(report.assertions.wasAlertGenerated).toBe(true);
      expect(report.assertions.alertSeverity).toBe("P2");
      expect(report.assertions.didOwnershipTransfer).toBe(true);
      expect(report.assertions.didOperatorSeeFailure).toBe(true);
    });

    it("Scenario 3: kill PostgreSQL -> asserts control plane read-only replica switch & local SQLite outbox (0s lost)", async () => {
      const report = await chaosRunner.runExperiment({
        scenario: "KILL_POSTGRES",
        targetId: "postgres-control-plane-primary",
        branchId: "BR-118",
      });

      expect(report.status).toBe("PASSED");
      expect(report.assertions.didRecordingRecover).toBe(true);
      expect(report.assertions.secondsLost).toBe(0);
      expect(report.assertions.wasAlertGenerated).toBe(true);
      expect(report.assertions.alertSeverity).toBe("P1");
      expect(report.assertions.didOwnershipTransfer).toBe(true);
      expect(report.assertions.didOperatorSeeFailure).toBe(true);
      expect(report.assertions.wasIncidentRecorded).toBe(true);
    });

    it("Scenario 13: kill media server -> asserts client live streaming rebalance in <2s with 0s backend loss", async () => {
      const report = await chaosRunner.runExperiment({
        scenario: "KILL_MEDIA_SERVER",
        targetId: "webrtc-media-gateway-01",
        branchId: "BR-118",
      });

      expect(report.status).toBe("PASSED");
      expect(report.assertions.didRecordingRecover).toBe(true);
      expect(report.assertions.secondsLost).toBe(0);
      expect(report.assertions.wasAlertGenerated).toBe(true);
      expect(report.assertions.didOwnershipTransfer).toBe(true);
      expect(report.assertions.didOperatorSeeFailure).toBe(true);
      expect(report.assertions.operatorNotificationLatencyMs).toBeLessThanOrEqual(1000);
    });
  });

  describe("Suite 2: Camera & Edge Device Failures", () => {
    it("Scenario 4: disconnect camera -> asserts instant video loss P1 alarm & work order creation", async () => {
      const report = await chaosRunner.runExperiment({
        scenario: "DISCONNECT_CAMERA",
        targetId: "CAM-118-VAULT-01",
        branchId: "BR-118",
      });

      expect(report.status).toBe("PASSED");
      expect(report.assertions.didRecordingRecover).toBe(true);
      expect(report.assertions.wasAlertGenerated).toBe(true);
      expect(report.assertions.alertSeverity).toBe("P1");
      expect(report.assertions.didOperatorSeeFailure).toBe(true);
      expect(report.assertions.operatorNotificationLatencyMs).toBeLessThanOrEqual(1000);
      expect(report.assertions.wasIncidentRecorded).toBe(true);
      expect(report.assertions.workOrderTicketId).toBeDefined();
    });

    it("Scenario 5: change camera password -> asserts 401 drift alarm & automated key re-sync from vault", async () => {
      const report = await chaosRunner.runExperiment({
        scenario: "CHANGE_CAMERA_PASSWORD",
        targetId: "CAM-118-VAULT-01",
        branchId: "BR-118",
      });

      expect(report.status).toBe("PASSED");
      expect(report.assertions.didRecordingRecover).toBe(true);
      expect(report.assertions.secondsLost).toBeLessThanOrEqual(5.0);
      expect(report.assertions.wasAlertGenerated).toBe(true);
      expect(report.assertions.didOperatorSeeFailure).toBe(true);
    });

    it("Scenario 6: reboot NVR -> asserts Sentinel Edge Gateway takes over direct recording with ZERO loss", async () => {
      const report = await chaosRunner.runExperiment({
        scenario: "REBOOT_NVR",
        targetId: "NVR-118-CORE-01",
        branchId: "BR-118",
      });

      expect(report.status).toBe("PASSED");
      expect(report.assertions.didRecordingRecover).toBe(true);
      expect(report.assertions.secondsLost).toBe(0); // Edge takeover prevented ANY downtime
      expect(report.assertions.wasAlertGenerated).toBe(true);
      expect(report.assertions.didOwnershipTransfer).toBe(true);
      expect(report.assertions.newOwnerNodeId).toBe("edge-agent-gw-118");
      expect(report.assertions.didOperatorSeeFailure).toBe(true);
      expect(report.assertions.wasIncidentRecorded).toBe(true);
    });
  });

  describe("Suite 3: Storage & Media Integrity Failures", () => {
    it("Scenario 7: fill disk (100%) -> asserts emergency FIFO purge & secondary storage redirection (0s lost)", async () => {
      const report = await chaosRunner.runExperiment({
        scenario: "FILL_DISK",
        targetId: "/dev/sda1-nvr-pool-BR-118",
        branchId: "BR-118",
        parameters: { diskUsagePercent: 100 },
      });

      expect(report.status).toBe("PASSED");
      expect(report.assertions.didRecordingRecover).toBe(true);
      expect(report.assertions.secondsLost).toBe(0);
      expect(report.assertions.wasAlertGenerated).toBe(true);
      expect(report.assertions.alertSeverity).toBe("P1");
      expect(report.assertions.didOwnershipTransfer).toBe(true);
      expect(report.assertions.didOperatorSeeFailure).toBe(true);
      expect(report.assertions.wasIncidentRecorded).toBe(true);
    });

    it("Scenario 8: remove storage -> asserts hot-standby NAS/SSD failover in <2s", async () => {
      const report = await chaosRunner.runExperiment({
        scenario: "REMOVE_STORAGE",
        targetId: "/mnt/nvr-storage-01",
        branchId: "BR-118",
      });

      expect(report.status).toBe("PASSED");
      expect(report.assertions.didRecordingRecover).toBe(true);
      expect(report.assertions.secondsLost).toBeLessThanOrEqual(1.0);
      expect(report.assertions.wasAlertGenerated).toBe(true);
      expect(report.assertions.didOwnershipTransfer).toBe(true);
      expect(report.assertions.didOperatorSeeFailure).toBe(true);
    });

    it("Scenario 12: corrupt segment -> asserts keyframe index rebuild & seamless playback fallback", async () => {
      const report = await chaosRunner.runExperiment({
        scenario: "CORRUPT_SEGMENT",
        targetId: "seg-118-vault-clip-001",
        branchId: "BR-118",
      });

      expect(report.status).toBe("PASSED");
      expect(report.assertions.didRecordingRecover).toBe(true);
      expect(report.assertions.secondsLost).toBeLessThanOrEqual(1.0);
      expect(report.assertions.wasAlertGenerated).toBe(true);
      expect(report.assertions.didOperatorSeeFailure).toBe(true);
      expect(report.assertions.wasIncidentRecorded).toBe(true);
    });
  });

  describe("Suite 4: Network Degradation & WAN Isolation", () => {
    it("Scenario 9: add packet loss (30%) -> asserts dynamic Adaptive Bitrate (ABR) step-down with 0s lost", async () => {
      const report = await chaosRunner.runExperiment({
        scenario: "ADD_PACKET_LOSS",
        targetId: "net-if-wan-BR-118",
        branchId: "BR-118",
        parameters: { packetLossPercent: 30 },
      });

      expect(report.status).toBe("PASSED");
      expect(report.assertions.didRecordingRecover).toBe(true);
      expect(report.assertions.secondsLost).toBe(0);
      expect(report.assertions.wasAlertGenerated).toBe(true);
      expect(report.assertions.didOperatorSeeFailure).toBe(true);
    });

    it("Scenario 10: add latency (1500ms) -> asserts automatic jitter buffer expansion without stutter", async () => {
      const report = await chaosRunner.runExperiment({
        scenario: "ADD_LATENCY",
        targetId: "net-if-wan-BR-118",
        branchId: "BR-118",
        parameters: { latencyMs: 1500 },
      });

      expect(report.status).toBe("PASSED");
      expect(report.assertions.didRecordingRecover).toBe(true);
      expect(report.assertions.secondsLost).toBe(0);
      expect(report.assertions.wasAlertGenerated).toBe(true);
      expect(report.assertions.didOperatorSeeFailure).toBe(true);
    });

    it("Scenario 11: disconnect branch WAN -> asserts Autonomous Edge Recording Mode with 100% video captured", async () => {
      const report = await chaosRunner.runExperiment({
        scenario: "DISCONNECT_BRANCH_WAN",
        targetId: "branch-wan-uplink-BR-118",
        branchId: "BR-118",
      });

      expect(report.status).toBe("PASSED");
      expect(report.assertions.didRecordingRecover).toBe(true);
      expect(report.assertions.secondsLost).toBe(0); // Autonomous edge recording captured 100% of footage
      expect(report.assertions.wasAlertGenerated).toBe(true);
      expect(report.assertions.alertSeverity).toBe("P1");
      expect(report.assertions.didOwnershipTransfer).toBe(true);
      expect(report.assertions.newOwnerNodeId).toBe("edge-gateway-autonomous-mode");
      expect(report.assertions.didOperatorSeeFailure).toBe(true);
      expect(report.assertions.wasIncidentRecorded).toBe(true);
    });
  });

  describe("Suite 5: Full Automated 13-Scenario Chaos Test Matrix", () => {
    it("executes the entire 13-scenario matrix and asserts >95% resilience score across all subsystems", async () => {
      const matrix = await chaosRunner.runFullChaosMatrix("BR-118");

      expect(matrix.totalScenarios).toBe(13);
      expect(matrix.passedCount).toBe(13);
      expect(matrix.failedCount).toBe(0);
      expect(matrix.overallResilienceScore).toBeGreaterThanOrEqual(95); // Bank grade resilience
      expect(matrix.p1AlertsTriggeredCount).toBeGreaterThanOrEqual(6);
      expect(matrix.incidentsCreatedCount).toBeGreaterThanOrEqual(6);

      // Verify all 13 scenarios are represented in the matrix report
      const executedScenarios = matrix.reports.map((r) => r.scenario);
      expect(executedScenarios).toContain("KILL_RECORDING_SERVICE");
      expect(executedScenarios).toContain("KILL_REDIS");
      expect(executedScenarios).toContain("KILL_POSTGRES");
      expect(executedScenarios).toContain("DISCONNECT_CAMERA");
      expect(executedScenarios).toContain("CHANGE_CAMERA_PASSWORD");
      expect(executedScenarios).toContain("REBOOT_NVR");
      expect(executedScenarios).toContain("FILL_DISK");
      expect(executedScenarios).toContain("REMOVE_STORAGE");
      expect(executedScenarios).toContain("ADD_PACKET_LOSS");
      expect(executedScenarios).toContain("ADD_LATENCY");
      expect(executedScenarios).toContain("DISCONNECT_BRANCH_WAN");
      expect(executedScenarios).toContain("CORRUPT_SEGMENT");
      expect(executedScenarios).toContain("KILL_MEDIA_SERVER");
    });

    it("evaluates ResiliencyAssessor diagnostics and strict SLA conformance", async () => {
      const report = await chaosRunner.runExperiment({
        scenario: "KILL_RECORDING_SERVICE",
        targetId: "recorder-worker-BR-118",
        branchId: "BR-118",
      });

      const assessment = assessor.assessExperiment(report);
      expect(assessment.passed).toBe(true);
      expect(assessment.assertionChecks.length).toBe(6);

      const checkNames = assessment.assertionChecks.map((c) => c.name);
      expect(checkNames).toContain("didRecordingRecover");
      expect(checkNames).toContain("secondsLost");
      expect(checkNames).toContain("wasAlertGenerated");
      expect(checkNames).toContain("didOwnershipTransfer");
      expect(checkNames).toContain("didOperatorSeeFailure");
      expect(checkNames).toContain("wasIncidentRecorded");
    });
  });
});
