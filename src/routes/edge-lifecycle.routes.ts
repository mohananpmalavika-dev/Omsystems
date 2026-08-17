import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { EdgeFleetManagerService } from "../edge-management/services/edge-fleet-manager.service.js";

const fleetService = new EdgeFleetManagerService();

export async function registerEdgeLifecycleRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  // Get Fleet Overview Summary (Total 400, Online, Degraded, Drifted, Expiring Certs, Version Distribution)
  app.get("/v1/edge/fleet/summary", async () => {
    return {
      success: true,
      data: fleetService.getFleetSummary(),
    };
  });

  // List all Edge Gateways with search & filtering
  app.get("/v1/edge/agents", async (request) => {
    const query = z
      .object({
        status: z.string().optional(),
        version: z.string().optional(),
        search: z.string().optional(),
        driftOnly: z.coerce.boolean().optional(),
      })
      .parse(request.query || {});

    const agents = fleetService.listAgents(query);
    return {
      success: true,
      count: agents.length,
      data: agents,
    };
  });

  // Get specific Edge Gateway details
  app.get("/v1/edge/agents/:agentId", async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const agent = fleetService.getAgentById(agentId);
    if (!agent) {
      return reply.code(404).send({ success: false, error: "AGENT_NOT_FOUND" });
    }
    return { success: true, data: agent };
  });

  // Get Edge Gateway Digital Twin Node with Blast Radius & Hardware Info
  app.get("/v1/edge/agents/:agentId/digital-twin", async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const twin = fleetService.getGatewayDigitalTwin(agentId);
    if (!twin) {
      return reply.code(404).send({ success: false, error: "TWIN_NOT_FOUND" });
    }
    return { success: true, data: twin };
  });

  // Check Pre-Upgrade Eligibility for a branch
  app.get("/v1/edge/agents/:agentId/eligibility", async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const eligibility = fleetService.checkEligibility(agentId);
    return { success: true, data: eligibility };
  });

  // Ingest Lightweight Heartbeat from Edge Agent (every 15-30s)
  app.post("/v1/edge/heartbeat", async (request) => {
    const body = request.body as any;
    const result = fleetService.processHeartbeat(body);
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
      const result = fleetService.reconcileConfiguration(agentId);
      return result;
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // Launch Staged Fleet Rollout (5% Canary -> 25% -> 50% -> 100%)
  app.post("/v1/edge/deployments/staged-rollout", async (request, reply) => {
    const body = (request.body as any) || {};
    try {
      const deployment = fleetService.createStagedRollout(body.releaseId || "REL-3.7.2");
      return {
        success: true,
        message: "Staged Canary deployment launched across 400 branches.",
        data: deployment,
      };
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });
}
