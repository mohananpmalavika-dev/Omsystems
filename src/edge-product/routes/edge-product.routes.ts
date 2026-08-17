/**
 * Enterprise Branch Edge Product API Routes
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { branchEdgeOrchestratorService } from "../services/branch-edge-orchestrator.service.js";
import { offlineStoreForwardService } from "../services/offline-store-forward.service.js";

export async function registerEdgeProductRoutes(app: FastifyInstance) {
  // 1. Fleet Health Summary (400 Branches)
  app.get("/api/edge-product/fleet/summary", { config: { noAuth: true } }, async (_request, reply) => {
    const summary = branchEdgeOrchestratorService.getFleetSummary();
    return reply.code(200).send({
      success: true,
      data: summary,
    });
  });

  // 2. List All Branch Agents
  app.get("/api/edge-product/agents", { config: { noAuth: true } }, async (_request, reply) => {
    const agents = branchEdgeOrchestratorService.listAgents();
    return reply.code(200).send({
      success: true,
      data: agents,
    });
  });

  // 3. Get Single Branch Agent
  app.get("/api/edge-product/agents/:agentId", { config: { noAuth: true } }, async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const agent = branchEdgeOrchestratorService.getAgent(agentId);
    if (!agent) {
      return reply.code(404).send({ success: false, error: "Agent not found" });
    }
    return reply.code(200).send({ success: true, data: agent });
  });

  // 4. Trigger Branch Multi-Protocol Device Discovery
  app.post("/api/edge-product/agents/:agentId/discovery/run", { config: { noAuth: true } }, async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const body = z.object({
      subnet: z.string().default("192.168.1.0/24"),
    }).parse(request.body || {});

    try {
      const report = await branchEdgeOrchestratorService.runDeviceDiscovery(agentId, body.subnet);
      return reply.code(200).send({ success: true, data: report });
    } catch (err: unknown) {
      return reply.code(400).send({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 5. Run Branch Network Diagnostics (Broadband vs LTE)
  app.post("/api/edge-product/agents/:agentId/diagnostics/network", { config: { noAuth: true } }, async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    try {
      const diag = await branchEdgeOrchestratorService.runNetworkDiagnostics(agentId);
      return reply.code(200).send({ success: true, data: diag });
    } catch (err: unknown) {
      return reply.code(400).send({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 6. Spool Event to Local Offline Buffer (WAN Outage simulation)
  app.post("/api/edge-product/agents/:agentId/buffer/spool", { config: { noAuth: true } }, async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const body = z.object({
      branchId: z.string(),
      eventType: z.string().default("INTRUSION_ALARM"),
      cameraId: z.string().optional(),
      severity: z.enum(["P1", "P2", "P3", "INFO"]).default("P1"),
      payload: z.record(z.unknown()).default({}),
      snapshotBase64: z.string().optional(),
    }).parse(request.body);

    const record = offlineStoreForwardService.spoolEvent(agentId, body.branchId, body);
    const queueState = offlineStoreForwardService.getQueueState(agentId, body.branchId);

    return reply.code(200).send({
      success: true,
      data: { record, queueState },
    });
  });

  // 7. Flush Offline Buffer Queue (Replay on WAN Reconnection)
  app.post("/api/edge-product/agents/:agentId/buffer/replay", { config: { noAuth: true } }, async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const body = z.object({
      batchSize: z.number().int().positive().default(50),
    }).parse(request.body || {});

    const result = await offlineStoreForwardService.flushBatch(agentId, body.batchSize);
    return reply.code(200).send({
      success: true,
      data: result,
    });
  });

  // 8. Rotate Camera Credentials on Branch LAN
  app.post("/api/edge-product/agents/:agentId/credentials/rotate", { config: { noAuth: true } }, async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const body = z.object({
      deviceId: z.string(),
      deviceIp: z.string(),
    }).parse(request.body);

    try {
      const task = await branchEdgeOrchestratorService.rotateCameraCredentials(agentId, body.deviceId, body.deviceIp);
      return reply.code(200).send({ success: true, data: task });
    } catch (err: unknown) {
      return reply.code(400).send({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 9. Sync Desired Config & Clear Drift
  app.post("/api/edge-product/agents/:agentId/config/sync", { config: { noAuth: true } }, async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const body = z.object({
      desiredRevision: z.string().default("rev-2026.08.17-a"),
    }).parse(request.body || {});

    try {
      const config = await branchEdgeOrchestratorService.syncDesiredConfig(agentId, body.desiredRevision);
      return reply.code(200).send({ success: true, data: config });
    } catch (err: unknown) {
      return reply.code(400).send({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 10. Deploy Staged OTA Update Rollout
  app.post("/api/edge-product/ota/deploy", { config: { noAuth: true } }, async (request, reply) => {
    const body = z.object({
      targetVersion: z.string().default("2.4.14-ga"),
      packageSha256: z.string().default("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"),
      signatureBase64: z.string().default("MEQCIE...signed..."),
    }).parse(request.body || {});

    const rollout = await branchEdgeOrchestratorService.deployOtaRollout(
      body.targetVersion,
      body.packageSha256,
      body.signatureBase64,
    );
    return reply.code(200).send({ success: true, data: rollout });
  });
}
