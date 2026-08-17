import { describe, it, expect, beforeEach } from "vitest";
import { SignedConfigService } from "../../src/config-management/services/signed-config.service.js";
import { EdgeAgentLifecycleService } from "../../src/edge-agent/services/edge-agent-lifecycle.service.js";
import { ClockMonitoringService } from "../../src/clock-monitoring/services/clock-monitoring.service.js";
import { OperationalMapService } from "../../src/operations/services/operational-map.service.js";
import { SocOperatorAnalyticsService } from "../../src/analytics/services/soc-operator-analytics.service.js";
import { MaintenanceTicketingService } from "../../src/maintenance/services/maintenance-ticketing.service.js";
import { DeterministicRcaService } from "../../src/services/command-center/deterministic-rca.service.js";

describe("Enterprise SOC Operations Subsystems (400-Branch Bank Scale)", () => {
  let configService: SignedConfigService;
  let edgeService: EdgeAgentLifecycleService;
  let clockService: ClockMonitoringService;
  let mapService: OperationalMapService;
  let analyticsService: SocOperatorAnalyticsService;
  let maintenanceService: MaintenanceTicketingService;
  let rcaService: DeterministicRcaService;

  beforeEach(() => {
    configService = new SignedConfigService();
    edgeService = new EdgeAgentLifecycleService();
    clockService = new ClockMonitoringService();
    mapService = new OperationalMapService();
    analyticsService = new SocOperatorAnalyticsService();
    maintenanceService = new MaintenanceTicketingService();
    rcaService = new DeterministicRcaService();
  });

  describe("Suite 1: Signed Configuration & Drift Detection", () => {
    it("cryptographically signs configuration package and verifies Ed25519 / HMAC signature manifest", () => {
      const activeVersion = configService.getActiveVersion();
      expect(activeVersion).toBeDefined();
      expect(activeVersion?.signature).toBeDefined();
      expect(activeVersion?.signature?.signature).toBeDefined();
      expect(activeVersion?.status).toBe("SIGNED");

      const isValid = configService.verifySignature(activeVersion!.id);
      expect(isValid).toBe(true);
    });

    it("detects configuration drift when actual branch gateway config diverges from desired", async () => {
      const branchState = configService.getBranchState("BR-118");
      expect(branchState).toBeDefined();
      expect(branchState?.status).toBe("DRIFTED");
      expect(branchState?.desiredVersion).toBe(34);
      expect(branchState?.actualVersion).toBe(32);

      const fieldPaths = branchState?.differences.map((d) => d.path) || [];
      expect(fieldPaths.some((p) => p.includes("bitrateKbps"))).toBe(true);
      expect(fieldPaths.some((p) => p.includes("ntpServer"))).toBe(true);
      expect(fieldPaths.some((p) => p.includes("continuousDays"))).toBe(true);
    });

    it("orchestrates staged canary rollouts (5% canary -> 25% -> 50% -> 100%) and instant rollback", async () => {
      const schedule = await configService.createRolloutSchedule({
        versionId: "cfg-v34-master",
        totalBranches: 400,
      });
      expect(schedule.totalBranches).toBe(400);

      const canary5 = await configService.updateRolloutStage("cfg-v34-master", "5_PERCENT_CANARY");
      expect(canary5.appliedBranchesCount).toBe(20); // 5% of 400 = 20 branches

      const rollback = await configService.rollbackBranch({
        branchId: "BR-118",
        targetVersionId: "cfg-v34-master",
        reason: "Canary anomaly detected on camera stream 4",
      });
      expect(rollback.status).toBe("ROLLED_BACK");
      expect(rollback.branchId).toBe("BR-118");
    });
  });

  describe("Suite 2: Edge-Agent Lifecycle Management", () => {
    it("records edge gateway telemetry (CPU, RAM, disk, config version, TLS cert expiry)", async () => {
      const node = await edgeService.recordHeartbeat({
        gatewayId: "gw-br-034",
        branchId: "BR-034",
        hostname: "EDGE-KOCHI-01",
        ipAddress: "10.0.34.5",
        agentVersion: "2.4.1",
        serviceUptimeSeconds: 1500000,
        cpuPercent: 12.4,
        ramPercent: 38.0,
        diskPercent: 62.1,
        appliedConfigVersion: 34,
        tlsCertExpiry: "2027-05-15T00:00:00Z",
        lastRestartAt: "2026-08-01T00:00:00Z",
        lastHeartbeatAt: new Date().toISOString(),
        healthStatus: "HEALTHY",
      });

      expect(node.gatewayId).toBe("gw-br-034");
      expect(node.healthStatus).toBe("HEALTHY");
      expect(node.cpuPercent).toBe(12.4);
    });

    it("triggers remote signed package upgrade and confirms upgrade state", async () => {
      const upgraded = await edgeService.triggerRemoteUpgrade("gw-br-118", "pkg-edge-v2-5-0");
      expect(upgraded.upgradeState.status).toBe("UPGRADING");
      expect(upgraded.upgradeState.targetVersion).toBe("2.5.0");

      const confirmed = await edgeService.confirmUpgradeResult("gw-br-118", true);
      expect(confirmed.agentVersion).toBe("2.5.0");
      expect(confirmed.upgradeState.status).toBe("UPGRADED");
    });
  });

  describe("Suite 3: Clock-Drift & Evidentiary Manifests", () => {
    it("enforces strict clock classification (<5s HEALTHY, 5-30s WARNING, >30s CRITICAL)", () => {
      expect(clockService.classifyOffsetHealth(1.2)).toBe("HEALTHY");
      expect(clockService.classifyOffsetHealth(18.5)).toBe("WARNING");
      expect(clockService.classifyOffsetHealth(45.0)).toBe("CRITICAL");
    });

    it("builds evidentiary clock manifest with HO Time, Gateway Time, NVR Time, and Camera Time", async () => {
      const manifest = await clockService.buildEvidenceClockManifest("ev-clip-vault-001", "BR-034", "cam-301-17");

      expect(manifest.evidenceId).toBe("ev-clip-vault-001");
      expect(manifest.hoReferenceTime).toBeDefined();
      expect(manifest.gatewayTime).toBeDefined();
      expect(manifest.nvrTime).toBeDefined();
      expect(manifest.cameraTime).toBeDefined();
      expect(manifest.clockHealthStatus).toBe("HEALTHY");
      expect(manifest.forensicTimestampConfidence).toBe("HIGH");
    });
  });

  describe("Suite 4: Multi-Tier Operational Maps (Milestone Smart Map Parity)", () => {
    it("drills down from National Country level to State, Region, Branch, and Floor Plan", async () => {
      // 1. Country level
      const root = await mapService.getNodeDetails("node-country-india");
      expect(root?.name).toContain("India");

      // 2. States level
      const states = await mapService.getChildrenNodes("node-country-india");
      expect(states.length).toBeGreaterThanOrEqual(2);

      // 3. Regions level
      const regions = await mapService.getChildrenNodes("node-state-kerala");
      expect(regions.length).toBeGreaterThanOrEqual(1);

      // 4. Branch Floor Plan
      const floorPlan = await mapService.getFloorPlan("floor-br-118-ground");
      expect(floorPlan).toBeDefined();
      expect(floorPlan?.cameras.length).toBeGreaterThanOrEqual(3);

      const entranceCam = floorPlan?.cameras.find((c) => c.cameraId === "CAM-118-01" || c.cameraName?.includes("Entrance"));
      expect(entranceCam).toBeDefined();
      expect(entranceCam?.status).toBe("ONLINE");
    });
  });

  describe("Suite 5: SOC Analytics & Operator Performance", () => {
    it("calculates MTTA, MTTI, MTTR, escalation rate, and shift SLA metrics", async () => {
      const summary = await analyticsService.getDashboardSummary("LAST_30_DAYS");

      expect(summary.fleetSummary.totalIncidents).toBeGreaterThan(0);
      expect(summary.fleetSummary.mttaSeconds).toBeLessThanOrEqual(30.0); // Bank SLA < 30s
      expect(summary.fleetSummary.slaCompliancePercent).toBeGreaterThanOrEqual(90.0);
      expect(summary.byOperator.length).toBeGreaterThanOrEqual(3);
      expect(summary.byBranch.length).toBeGreaterThanOrEqual(3);
      expect(summary.byShift.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Suite 6: Maintenance Ticketing & Spare Hardware Lifecycle", () => {
    it("automatically creates work order ticket for offline device (>10 min)", async () => {
      const ticket = await maintenanceService.createTicketForOfflineDevice({
        branchId: "BR-034",
        deviceId: "cam-301-09",
        deviceName: "Back Grille Gate Camera",
        deviceType: "CAMERA",
        priority: "P1",
      });

      expect(ticket.ticketNumber).toContain("WO-");
      expect(ticket.status).toBe("OPEN");
      expect(ticket.priority).toBe("P1");
      expect(ticket.impact.securityCoverageLost).toBe(true);
    });

    it("replaces faulty hardware with spare: retires old serial, installs new serial, and updates inventory", async () => {
      const ticket = await maintenanceService.createTicketForOfflineDevice({
        branchId: "BR-034",
        deviceId: "cam-301-17",
        deviceName: "Vault Door Primary",
        deviceType: "CAMERA",
      });

      const { ticket: updatedTicket, newInventory } = await maintenanceService.executeDeviceReplacement(
        ticket.id,
        "CP-CAM-4K-VAULT-882",
        "CP-CAM-4K-VAULT-999-NEW",
        "CP PLUS 4MP WDR IR Bullet",
        "Replaced moisture-damaged sensor board with new sealed spare unit.",
      );

      expect(updatedTicket.replacement?.newSerial).toBe("CP-CAM-4K-VAULT-999-NEW");
      expect(newInventory.hardwareStatus).toBe("ACTIVE");

      const oldInv = maintenanceService.getInventory("CP-CAM-4K-VAULT-882");
      expect(oldInv?.hardwareStatus).toBe("RETIRED");
      expect(oldInv?.replacementHistory.length).toBeGreaterThan(0);
    });

    it("executes automated verification before ticket closure", async () => {
      const ticket = await maintenanceService.createTicketForOfflineDevice({
        branchId: "BR-034",
        deviceId: "cam-301-17",
        deviceName: "Vault Door Primary",
        deviceType: "CAMERA",
      });

      const verifiedTicket = await maintenanceService.executeVerification(ticket.id, "SOC-OPERATOR-1");
      expect(verifiedTicket.status).toBe("CLOSED");
      expect(verifiedTicket.closureVerification.rtspPass).toBe(true);
      expect(verifiedTicket.closureVerification.recordingPass).toBe(true);
    });
  });

  describe("Suite 7: 100% Free / Local Deterministic Root-Cause Analysis", () => {
    it("determines Mains Power / UPS failure and suppresses 48 cascading downstream alerts", async () => {
      const rca = await rcaService.analyzeBranchOutage({
        branchId: "BR-118",
        unreachableNodeIds: ["router-118", "nvr-118", "cam-118-01", "cam-118-02"],
        powerStatus: "UPS_CRITICAL",
        wanStatus: "DISCONNECTED",
      });

      expect(rca.rootCauseNodeType).toBe("UPS_POWER");
      expect(rca.blastRadius.suppressedAlertsCount).toBe(48);
      expect(rca.confidenceScore).toBeGreaterThanOrEqual(0.95);
      expect(rca.narrativeExplanation).toContain("AC Mains Power Loss");
    });

    it("determines Router-01 WAN interface drop and generates deterministic explanation without paid APIs", async () => {
      const rca = await rcaService.analyzeBranchOutage({
        branchId: "BR-034",
        unreachableNodeIds: ["router-034"],
        powerStatus: "NORMAL",
        wanStatus: "DISCONNECTED",
      });

      expect(rca.rootCauseNodeType).toBe("ROUTER");
      expect(rca.rootCauseName).toContain("Router-01");
      expect(rca.blastRadius.suppressedAlertsCount).toBe(24);
      expect(rca.narrativeExplanation).toContain("Router-01 became unreachable");
    });
  });
});
