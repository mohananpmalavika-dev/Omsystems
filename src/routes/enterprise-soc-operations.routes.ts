import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { registerSignedConfigRoutes } from "../config-management/routes/signed-config.routes.js";
import { EdgeAgentLifecycleService } from "../edge-agent/services/edge-agent-lifecycle.service.js";
import { ClockMonitoringService } from "../clock-monitoring/services/clock-monitoring.service.js";
import { OperationalMapService } from "../operations/services/operational-map.service.js";
import { SocOperatorAnalyticsService } from "../analytics/services/soc-operator-analytics.service.js";
import { MaintenanceTicketingService } from "../maintenance/services/maintenance-ticketing.service.js";
import { DeterministicRcaService } from "../services/command-center/deterministic-rca.service.js";

export async function registerEnterpriseSocOperationsRoutes(app: FastifyInstance) {
  await registerSignedConfigRoutes(app);
  const edgeAgentService = new EdgeAgentLifecycleService();
  const clockService = new ClockMonitoringService();
  const mapService = new OperationalMapService();
  const analyticsService = new SocOperatorAnalyticsService();
  const maintenanceService = new MaintenanceTicketingService();
  const rcaService = new DeterministicRcaService();

  // 2. Edge Agent Lifecycle
  app.get("/v1/edge/nodes", async () => ({ data: edgeAgentService.listNodes() }));
  app.get("/v1/edge/packages", async () => ({ data: edgeAgentService.listPackages() }));
  app.post("/v1/edge/upgrade", async (req: FastifyRequest) => {
    const body = z.object({ gatewayId: z.string(), packageId: z.string() }).parse(req.body);
    const node = await edgeAgentService.triggerRemoteUpgrade(body.gatewayId, body.packageId);
    return { node };
  });

  // 3. Clock Drift & Evidence Manifest
  app.get("/v1/clock/branch/:branchId", async (req: FastifyRequest) => {
    const { branchId } = req.params as { branchId: string };
    const health = await clockService.getBranchClockHealth(branchId);
    return { data: health };
  });
  app.get("/v1/clock/evidence-manifest", async (req: FastifyRequest) => {
    const query = req.query as { evidenceId?: string; branchId?: string; cameraId?: string };
    const manifest = await clockService.buildEvidenceClockManifest(
      query.evidenceId || "ev-sample-123",
      query.branchId || "BR-034",
      query.cameraId || "cam-301-17",
    );
    return { manifest };
  });

  // 4. Operational Maps Drilldown
  app.get("/v1/map/hierarchy", async (req: FastifyRequest) => {
    const parentId = (req.query as any)?.parentId;
    const nodes = await mapService.getChildrenNodes(parentId);
    return { data: nodes };
  });
  app.get("/v1/map/floor-plan/:branchId", async (req: FastifyRequest) => {
    const { branchId } = req.params as { branchId: string };
    const plan = await mapService.getFloorPlan(branchId);
    return { data: plan };
  });

  // 5. SOC Analytics
  app.get("/v1/analytics/soc/summary", async () => {
    const summary = await analyticsService.getDashboardSummary();
    return { data: summary };
  });

  // 6. Maintenance Ticketing & Spare Replacement
  app.get("/v1/maintenance/tickets", async (req: FastifyRequest) => {
    const branchId = (req.query as any)?.branchId;
    return { data: maintenanceService.listTickets(branchId) };
  });
  app.post("/v1/maintenance/tickets", async (req: FastifyRequest) => {
    const body = z
      .object({
        branchId: z.string(),
        deviceId: z.string(),
        deviceName: z.string(),
        deviceType: z.enum(["CAMERA", "RECORDER", "GATEWAY", "SWITCH", "ROUTER", "UPS"]),
        priority: z.enum(["P1_URGENT", "P2_HIGH", "P3_STANDARD"]).optional(),
      })
      .parse(req.body);
    const ticket = await maintenanceService.createTicketForOfflineDevice(body);
    return { ticket };
  });
  app.post("/v1/maintenance/tickets/:id/replace-spare", async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        oldSerial: z.string(),
        newSerial: z.string(),
        modelName: z.string(),
        workNotes: z.string(),
      })
      .parse(req.body);
    const result = await maintenanceService.executeDeviceReplacement(
      id,
      body.oldSerial,
      body.newSerial,
      body.modelName,
      body.workNotes,
    );
    return result;
  });
  app.post("/v1/maintenance/tickets/:id/close", async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        streamOnlineVerified: z.boolean().default(true),
        recordingVerified: z.boolean().default(true),
        verifiedByOperatorId: z.string().default("usr-operator-1"),
      })
      .parse(req.body);
    const ticket = await maintenanceService.closeTicketWithVerification(id, body);
    return { ticket };
  });
  app.get("/v1/maintenance/inventory", async (req: FastifyRequest) => {
    const branchId = (req.query as any)?.branchId;
    return { data: maintenanceService.listInventory(branchId) };
  });

  // 7. Deterministic Root Cause Analysis (100% Free / Local)
  app.post("/v1/rca/analyze-branch", async (req: FastifyRequest) => {
    const body = z
      .object({
        branchId: z.string(),
        unreachableNodeIds: z.array(z.string()).default([]),
        powerStatus: z.enum(["NORMAL", "MAINS_OUTAGE", "UPS_CRITICAL"]).default("NORMAL"),
        wanStatus: z.enum(["ONLINE", "DISCONNECTED", "PACKET_LOSS"]).default("ONLINE"),
      })
      .parse(req.body);

    const rca = await rcaService.analyzeBranchOutage(body);
    return { rca };
  });
}
