import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { EdgeFleetManagerService } from "../edge-management/services/edge-fleet-manager.service.js";
import { EdgeFleetInitializerService } from "../edge-management/services/edge-fleet-initializer.service.js";

/**
 * Edge Lifecycle Routes
 * 
 * Provides production-ready fleet management endpoints with persistent storage.
 * Fleet is initialized from branch infrastructure on first request per tenant.
 */
export async function registerEdgeLifecycleRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  const fleetService = new EdgeFleetManagerService(store);
  const initializerService = new EdgeFleetInitializerService(store);
  
  // Track which tenants have been initialized
  const initializedTenants = new Set<string>();

  /**
   * Ensure fleet is initialized for tenant before processing requests.
   * Runs once per tenant during application lifecycle.
   */
  async function ensureFleetInitialized(tenantId: string): Promise<void> {
    if (initializedTenants.has(tenantId)) {
      return;
    }

    try {
      console.log(`[EdgeFleet] Initializing fleet for tenant: ${tenantId}`);
      const result = await initializerService.syncFleet(tenantId);
      console.log(`[EdgeFleet] Initialization complete:`, {
        initialized: result.initialized,
        skipped: result.skipped,
        totalAgents: result.summary.totalAgents,
      });
      initializedTenants.add(tenantId);
    } catch (error) {
      console.error(`[EdgeFleet] Failed to initialize fleet for tenant ${tenantId}:`, error);
      // Don't throw - allow endpoints to work with empty fleet
    }
  }

  /**
   * Get tenant ID from request context.
   * In production, extract from authenticated user session.
   */
  function getTenantId(request: any): string {
    return request.currentUser?.tenantId || "omsystems";
  }

  // Get Fleet Overview Summary
  app.get("/v1/edge/fleet/summary", async (request) => {
    const tenantId = getTenantId(request);
    await ensureFleetInitialized(tenantId);
    
    return {
      success: true,
      data: await fleetService.getFleetSummary(tenantId),
    };
  });

  // List all Edge Gateways with search & filtering
  app.get("/v1/edge/agents", async (request) => {
    const tenantId = getTenantId(request);
    await ensureFleetInitialized(tenantId);
    
    const query = z
      .object({
        status: z.string().optional(),
        version: z.string().optional(),
        search: z.string().optional(),
        driftOnly: z.coerce.boolean().optional(),
      })
      .parse(request.query || {});

    const agents = await fleetService.listAgents(tenantId, query);
    return {
      success: true,
      count: agents.length,
      data: agents,
    };
  });

  // Get specific Edge Gateway details
  app.get("/v1/edge/agents/:agentId", async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const agent = await fleetService.getAgentById(agentId);
    if (!agent) {
      return reply.code(404).send({ success: false, error: "AGENT_NOT_FOUND" });
    }
    return { success: true, data: agent };
  });

  // Get Edge Gateway Digital Twin Node with Blast Radius & Hardware Info
  app.get("/v1/edge/agents/:agentId/digital-twin", async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const twin = await fleetService.getGatewayDigitalTwin(agentId);
    if (!twin) {
      return reply.code(404).send({ success: false, error: "TWIN_NOT_FOUND" });
    }
    return { success: true, data: twin };
  });

  // Check Pre-Upgrade Eligibility for a branch
  app.get("/v1/edge/agents/:agentId/eligibility", async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const eligibility = await fleetService.checkEligibility(agentId);
    return { success: true, data: eligibility };
  });

  // Ingest Lightweight Heartbeat from Edge Agent (every 15-30s)
  app.post("/v1/edge/heartbeat", async (request) => {
    const body = request.body as any;
    const result = await fleetService.processHeartbeat(body);
    return result;
  });

  // Trigger 1-Click Remote Upgrade with full state machine progression
  app.post("/v1/edge/agents/:agentId/upgrade", async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const body = (request.body as any) || {};
    try {
      const run = await fleetService.executeUpgrade(agentId, body.targetVersion || "3.7.2");
      return { success: true, message: "Upgrade executed and verified successfully.", data: run };
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // Trigger Instant Rollback
  app.post("/v1/edge/agents/:agentId/rollback", async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    try {
      const run = await fleetService.executeRollback(agentId);
      return { success: true, message: "Rollback executed and verified successfully.", data: run };
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // Reconcile Desired Configuration State
  app.post("/v1/edge/agents/:agentId/reconcile-config", async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    try {
      const result = await fleetService.reconcileConfiguration(agentId);
      return result;
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // Launch Staged Fleet Rollout (5% Canary -> 25% -> 50% -> 100%)
  app.post("/v1/edge/deployments/staged-rollout", async (request, reply) => {
    const tenantId = getTenantId(request);
    await ensureFleetInitialized(tenantId);
    
    const body = (request.body as any) || {};
    try {
      const deployment = await fleetService.createStagedRollout(tenantId, body.releaseId || "REL-3.7.2");
      return {
        success: true,
        message: "Staged Canary deployment launched across fleet.",
        data: deployment,
      };
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // Manual Fleet Initialization Endpoint (admin use)
  app.post("/v1/edge/fleet/initialize", async (request, reply) => {
    const tenantId = getTenantId(request);
    
    try {
      const result = await initializerService.initializeFleet(tenantId);
      return {
        success: true,
        message: "Fleet initialization completed",
        data: result,
      };
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message });
    }
  });

  // Fleet Sync Endpoint (reconcile with branch infrastructure)
  app.post("/v1/edge/fleet/sync", async (request, reply) => {
    const tenantId = getTenantId(request);
    
    try {
      const result = await initializerService.syncFleet(tenantId);
      initializedTenants.add(tenantId); // Mark as initialized
      return {
        success: true,
        message: "Fleet synchronized with branch infrastructure",
        data: result,
      };
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message });
    }
  });

  // Reinitialize specific branch agent
  app.post("/v1/edge/agents/:branchId/reinitialize", async (request, reply) => {
    const tenantId = getTenantId(request);
    const { branchId } = request.params as { branchId: string };
    
    try {
      const agent = await initializerService.reinitializeBranchAgent(tenantId, branchId);
      return {
        success: true,
        message: `Edge agent reinitialized for branch ${branchId}`,
        data: agent,
      };
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });
}
