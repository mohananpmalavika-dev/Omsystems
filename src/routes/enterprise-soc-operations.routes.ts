import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { registerSignedConfigRoutes } from "../config-management/routes/signed-config.routes.js";
import { registerOperationalMapRoutes } from "./operational-map.routes.js";
import { registerSocAnalyticsRoutes } from "../analytics/routes/soc-analytics.routes.js";
import { EdgeAgentLifecycleService } from "../edge-agent/services/edge-agent-lifecycle.service.js";
import { ClockMonitoringService } from "../clock-monitoring/services/clock-monitoring.service.js";
import { MaintenanceTicketingService } from "../maintenance/services/maintenance-ticketing.service.js";
import { DeterministicRcaService } from "../services/command-center/deterministic-rca.service.js";

export async function registerEnterpriseSocOperationsRoutes(app: FastifyInstance) {
  await registerSignedConfigRoutes(app);
  await registerOperationalMapRoutes(app);
  await registerSocAnalyticsRoutes(app);
  const edgeAgentService = new EdgeAgentLifecycleService();
  const clockService = new ClockMonitoringService();
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

  // 6. Maintenance Ticketing & Field Service Lifecycle
  app.get("/v1/maintenance/metrics", async () => ({
    success: true,
    data: maintenanceService.getMaintenanceMetrics(),
  }));

  app.get("/v1/maintenance/tickets", async (req: FastifyRequest) => {
    const query = req.query as any;
    return { success: true, data: maintenanceService.listTickets(query) };
  });

  app.get("/v1/maintenance/tickets/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const ticket = maintenanceService.getTicket(id);
    if (!ticket) return reply.code(404).send({ success: false, error: "TICKET_NOT_FOUND" });
    return { success: true, data: ticket };
  });

  app.post("/v1/maintenance/tickets", async (req: FastifyRequest) => {
    const body = z
      .object({
        tenantId: z.string().optional(),
        branchId: z.string(),
        branchName: z.string().optional(),
        deviceId: z.string(),
        deviceName: z.string(),
        deviceType: z.enum(["CAMERA", "NVR", "DVR", "EDGE_GATEWAY", "DISK", "NETWORK", "UPS", "SWITCH", "OTHER"]),
        faultCode: z.string().optional(),
        faultDescription: z.string().optional(),
        priority: z.enum(["P1", "P2", "P3", "P4"]).optional(),
      })
      .parse(req.body);
    const ticket = await maintenanceService.createTicketForOfflineDevice(body);
    return { success: true, ticket };
  });

  app.post("/v1/maintenance/tickets/:id/diagnose", async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    const ticket = maintenanceService.getTicket(id);
    if (!ticket) throw new Error("TICKET_NOT_FOUND");
    const diag = await maintenanceService.runAutomatedDiagnostics(ticket.branchId, ticket.assetId, ticket.assetType);
    ticket.diagnostics = diag;
    return { success: true, data: diag };
  });

  app.post("/v1/maintenance/tickets/:id/assign", async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        engineerId: z.string(),
        name: z.string(),
        contactNumber: z.string(),
        vendorName: z.string().optional(),
      })
      .parse(req.body);
    const ticket = await maintenanceService.assignEngineer(id, body);
    return { success: true, ticket };
  });

  app.post("/v1/maintenance/tickets/:id/visit-progress", async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        action: z.enum(["START_REMOTE", "REQUEST_ONSITE", "ARRIVED", "ADD_WORK_LOG"]),
        workNotes: z.string().optional(),
      })
      .parse(req.body);
    const ticket = await maintenanceService.recordVisitProgress(id, body.action, { workNotes: body.workNotes });
    return { success: true, ticket };
  });

  app.post("/v1/maintenance/tickets/:id/replace-spare", async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        oldSerial: z.string(),
        newSerial: z.string(),
        modelName: z.string(),
        workNotes: z.string(),
        rootCause: z.string().optional(),
      })
      .parse(req.body);
    const result = await maintenanceService.executeDeviceReplacement(
      id,
      body.oldSerial,
      body.newSerial,
      body.modelName,
      body.workNotes,
      (body.rootCause as any) || "CAMERA_HARDWARE",
    );
    return { success: true, ...result };
  });

  app.post("/v1/maintenance/tickets/:id/verify", async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    const ticket = await maintenanceService.executeVerification(id);
    return { success: true, ticket };
  });

  app.post("/v1/maintenance/tickets/:id/close", async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    const ticket = await maintenanceService.executeVerification(id);
    return { success: true, ticket };
  });

  app.get("/v1/maintenance/inventory", async (req: FastifyRequest) => {
    const branchId = (req.query as any)?.branchId;
    return { success: true, data: maintenanceService.listInventory(branchId) };
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
