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
    it("cryptographically signs configuration package and verifies HMAC-SHA256 signature", () => {
      const config = configService.getDesiredConfig("cfg-fleet-v34");
      expect(config).toBeDefined();
      expect(config?.signature).toBeDefined();
      expect(config?.signedPackageSha256).toBeDefined();

      const isValid = configService.verifySignature(config!);
      expect(isValid).toBe(true);
    });

    it("detects configuration drift when actual branch gateway config diverges from desired", async () => {
      const desired = configService.getDesiredConfig("cfg-fleet-v34")!;
      const actual = configService.getActualReport("BR-118")!;

      const drift = configService.detectDrift(desired, actual);
      expect(drift.status).toBe("DRIFTED");
      expect(drift.desiredVersion).toBe(34);
      expect(drift.actualVersion).toBe(32);

      const fieldNames = drift.driftedFields.map((f) => f.field);
      expect(fieldNames).toContain("cameraDefaultBitrateKbps");
      expect(fieldNames).toContain("nvrNtpServer");
      expect(fieldNames).toContain("retentionDays");
    });

    it("orchestrates staged canary rollouts (5% canary -> 25% -> 50% -> 100%) and instant rollback", async () => {
      const canary5 = await configService.initiateRollout("cfg-fleet-v34", "5_PERCENT_CANARY", 400);
      expect(canary5.appliedCount).toBe(20); // 5% of 400 = 20 branches
      expect(canary5.canaryBranchIds.length).toBe(20);

      const rolledBack = await configService.rollbackRollout(canary5.rolloutId);
      expect(rolledBack.stage).toBe("ROLLED_BACK");
      expect(rolledBack.appliedCount).toBe(0);
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
      const root = await mapService.getNodeDetails("node-india");
      expect(root?.name).toBe("India National SOC");

      // 2. States level
      const states = await mapService.getChildrenNodes("node-india");
      expect(states.length).toBeGreaterThanOrEqual(2);

      // 3. Regions level
      const regions = await mapService.getChildrenNodes("node-state-kerala");
      expect(regions.length).toBeGreaterThanOrEqual(1);

      // 4. Branch Floor Plan
      const floorPlan = await mapService.getFloorPlan("BR-034");
      expect(floorPlan).toBeDefined();
      expect(floorPlan?.cameras.length).toBe(4);

      const vaultCam = floorPlan?.cameras.find((c) => c.cameraId === "cam-301-17");
      expect(vaultCam?.status).toBe("ALERTING");
      expect(vaultCam?.xPercent).toBe(82);
    });
  });

  describe("Suite 5: SOC Analytics & Operator Performance", () => {
    it("calculates MTTA, MTTI, MTTR, escalation rate, and shift SLA metrics", async () => {
      const summary = await analyticsService.getDashboardSummary("LAST_30_DAYS");

      expect(summary.totalIncidents).toBeGreaterThan(0);
      expect(summary.fleetMttaSeconds).toBeLessThanOrEqual(30.0); // Bank SLA < 30s
      expect(summary.slaCompliancePercent).toBeGreaterThanOrEqual(95.0);
      expect(summary.operators.length).toBeGreaterThanOrEqual(3);
      expect(summary.byShift.morningShift).toBeDefined();
      expect(summary.byShift.nightShift).toBeDefined();
    });
  });

  describe("Suite 6: Maintenance Ticketing & Spare Hardware Lifecycle", () => {
    it("automatically creates work order ticket for offline device (>10 min)", async () => {
      const ticket = await maintenanceService.createTicketForOfflineDevice({
        branchId: "BR-034",
        deviceId: "cam-301-09",
        deviceName: "Back Grille Gate Camera",
        deviceType: "CAMERA",
        priority: "P1_URGENT",
      });

      expect(ticket.ticketNumber).toContain("WO-");
      expect(ticket.status).toBe("OPEN");
      expect(ticket.impactLevel).toBe("CRITICAL_SECURITY");
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

      expect(updatedTicket.replacementDevice?.newSerialNumber).toBe("CP-CAM-4K-VAULT-999-NEW");
      expect(newInventory.hardwareStatus).toBe("ACTIVE");

      const oldInv = maintenanceService.getInventory("CP-CAM-4K-VAULT-882");
      expect(oldInv?.hardwareStatus).toBe("RETIRED");
      expect(oldInv?.replacementHistory.length).toBeGreaterThan(0);
    });

    it("strictly blocks ticket closure until Live Stream Online and Recording are verified", async () => {
      const ticket = await maintenanceService.createTicketForOfflineDevice({
        branchId: "BR-034",
        deviceId: "cam-301-17",
        deviceName: "Vault Door Primary",
        deviceType: "CAMERA",
      });

      // Attempt closure without stream verification must fail
      await expect(
        maintenanceService.closeTicketWithVerification(ticket.id, {
          streamOnlineVerified: false,
          recordingVerified: true,
          verifiedByOperatorId: "usr-op-1",
        }),
      ).rejects.toThrow(/Both Live Stream Online and Continuous Recording must be verified/);

      // Verified closure succeeds
      const closed = await maintenanceService.closeTicketWithVerification(ticket.id, {
        streamOnlineVerified: true,
        recordingVerified: true,
        verifiedByOperatorId: "usr-op-1",
      });
      expect(closed.status).toBe("CLOSED");
      expect(closed.closureVerification.streamOnlineVerified).toBe(true);
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
