import { describe, it, expect, beforeEach } from "vitest";
import {
  BranchEdgeOrchestratorService,
} from "../src/edge-product/services/branch-edge-orchestrator.service.js";
import {
  OfflineStoreForwardService,
} from "../src/edge-product/services/offline-store-forward.service.js";

describe("Enterprise 400-Branch Edge Agent Subsystem Test Suite", () => {
  let orchestrator: BranchEdgeOrchestratorService;
  let storeForward: OfflineStoreForwardService;

  beforeEach(() => {
    orchestrator = new BranchEdgeOrchestratorService();
    storeForward = new OfflineStoreForwardService();
  });

  it("Invariant 1: Multi-Protocol Device Discovery discovers ONVIF, Dahua, Hikvision, and CP PLUS devices", async () => {
    const report = await orchestrator.runDeviceDiscovery("agent-br-mum-01", "192.168.1.0/24");
    expect(report.totalDevicesFound).toBeGreaterThanOrEqual(4);
    expect(report.devices.some((d) => d.protocol === "CPPLUS_PROPRIETARY")).toBe(true);
    expect(report.devices.some((d) => d.protocol === "DAHUA_CGI")).toBe(true);
    expect(report.devices.some((d) => d.protocol === "HIKVISION_ISAPI")).toBe(true);
    expect(report.devices.some((d) => d.protocol === "ONVIF")).toBe(true);
  });

  it("Invariant 2: Local Health tracks sub-second camera latency and S.M.A.R.T disk status", () => {
    const agent = orchestrator.getAgent("agent-br-mum-01");
    expect(agent).toBeDefined();
    expect(agent!.health.cameraLatencyP95Ms).toBeLessThan(100);
    expect(agent!.health.nvrSmartStatus).toBe("HEALTHY");
    expect(agent!.health.diskFreeGb).toBeGreaterThan(0);
  });

  it("Invariant 3: Recorder integration verifies NTP time sync drift within safe window", () => {
    const agent = orchestrator.getAgent("agent-br-mum-01");
    expect(agent!.health.ntpTimeDriftMs).toBeLessThan(500); // Must be under 500ms for banking compliance
    expect(agent!.health.activeStreamCount).toBe(16);
  });

  it("Invariant 4: Network Diagnostics detects WAN vs LTE failover mode accurately", async () => {
    const diag = await orchestrator.runNetworkDiagnostics("agent-br-mum-03"); // Seeded as LTE failover
    expect(diag.currentUplink).toBe("LTE_FAILOVER");
    expect(diag.wanUplinkMbps).toBeLessThan(100);
    expect(diag.lteSignalStrengthDbm).toBeDefined();
  });

  it("Invariant 5: Local Buffering spools P1 events and snapshots during WAN outage", () => {
    const agentId = "agent-br-mum-01";
    const branchId = "BR-MUM-01";

    const spooled = storeForward.spoolEvent(agentId, branchId, {
      eventType: "VAULT_INTRUSION_ALARM",
      cameraId: "CAM-01",
      severity: "P1",
      payload: { zone: "Vault Safe #4", pirTriggered: true },
      snapshotBase64: "data:image/jpeg;base64,iVBORw0KGgo...",
    });

    expect(spooled.sequenceNumber).toBe(1);
    expect(spooled.syncedToCloud).toBe(false);

    const state = storeForward.getQueueState(agentId, branchId);
    expect(state.isBufferingActive).toBe(true);
    expect(state.totalBufferedEvents).toBe(1);
    expect(state.unflushedP1Events).toBe(1);
  });

  it("Invariant 6: Queue Flush replays spooled events with deduplication upon WAN restoration", async () => {
    const agentId = "agent-br-blr-01";
    const branchId = "BR-BLR-01";

    // Spool 3 events (with 1 duplicate)
    storeForward.spoolEvent(agentId, branchId, {
      eventType: "DOOR_FORCED",
      cameraId: "CAM-02",
      severity: "P1",
      payload: { door: "Main Gate" },
    });
    storeForward.spoolEvent(agentId, branchId, {
      eventType: "DOOR_FORCED",
      cameraId: "CAM-02",
      severity: "P1",
      payload: { door: "Main Gate" },
    });
    storeForward.spoolEvent(agentId, branchId, {
      eventType: "SMOKE_DETECTED",
      cameraId: "CAM-03",
      severity: "P1",
      payload: { area: "ATM Vestibule" },
    });

    const result = await storeForward.flushBatch(agentId, 10);
    expect(result.flushedCount).toBe(2); // 2 unique
    expect(result.deduplicatedCount).toBe(1); // 1 duplicate filtered
    expect(result.remainingCount).toBe(0);
  });

  it("Invariant 7: Configuration Sync detects and resolves drift against Desired State", async () => {
    const agent = orchestrator.getAgent("agent-br-mum-02");
    expect(agent!.configSync.isDriftDetected).toBe(true);
    expect(agent!.configSync.driftFields).toContain("recordingBitrate");

    // Sync to desired revision
    const synced = await orchestrator.syncDesiredConfig("agent-br-mum-02", "rev-2026.08.17-a");
    expect(synced.isDriftDetected).toBe(false);
    expect(synced.actualRevision).toBe("rev-2026.08.17-a");
  });

  it("Invariant 8: Credential Rotation rotates camera credentials locally on branch subnet", async () => {
    const task = await orchestrator.rotateCameraCredentials("agent-br-mum-01", "CAM-042", "192.168.1.42");
    expect(task.status).toBe("ROTATED_VERIFIED");
    expect(task.completedAt).toBeDefined();
  });

  it("Invariant 9: 400-Branch Fleet Summary computes aggregate compliance and LTE load", () => {
    const summary = orchestrator.getFleetSummary();
    expect(summary.totalAgents).toBe(400);
    expect(summary.totalManagedCameras).toBeGreaterThan(5000);
    expect(summary.totalManagedRecorders).toBe(400);
    expect(summary.complianceScore).toBeGreaterThanOrEqual(99);
  });

  it("Invariant 10: Signed OTA Rollout initiates canary stage with SHA-256 package verification", async () => {
    const rollout = await orchestrator.deployOtaRollout(
      "2.4.14-ga",
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "MEQCIE...signature...",
    );

    expect(rollout.stage).toBe("CANARY_5_BRANCHES");
    expect(rollout.totalTargetBranches).toBe(400);
    expect(rollout.successfulUpdates).toBe(5);
    expect(rollout.autoRollbackTriggered).toBe(false);
  });
});
