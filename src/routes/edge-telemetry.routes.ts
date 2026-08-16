/**
 * Edge Telemetry Ingestion REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { telemetryIngestionService, CompressionService } from "../telemetry/index.js";

export async function registerEdgeTelemetryRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/edge/telemetry
   */
  const handleIngestTelemetry = async (request: FastifyRequest, reply: FastifyReply) => {
    let payload = request.body as any;

    // Support gzip compressed body
    if (request.headers["content-encoding"] === "gzip" && Buffer.isBuffer(request.body)) {
      const json = await CompressionService.decompress(request.body);
      payload = JSON.parse(json);
    }

    if (!payload || !payload.branchId || !payload.agentId || !payload.messageId) {
      return reply.status(400).send({ success: false, error: "Invalid BranchTelemetryEnvelope" });
    }

    const result = await telemetryIngestionService.ingestEnvelope(payload);
    return reply.status(202).send({ success: true, data: result });
  };

  app.post("/api/v1/edge/telemetry", handleIngestTelemetry);
  app.post("/v1/edge/telemetry", handleIngestTelemetry);

  /**
   * POST /api/v1/edge/transitions
   */
  const handleIngestTransition = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    if (!body || !body.deviceId || !body.currentState) {
      return reply.status(400).send({ success: false, error: "Invalid DeviceHealthChangedEvent" });
    }
    await telemetryIngestionService.recordTransition(body);
    return reply.status(202).send({ success: true, accepted: true });
  };

  app.post("/api/v1/edge/transitions", handleIngestTransition);
  app.post("/v1/edge/transitions", handleIngestTransition);

  /**
   * GET /api/v1/edge/agents
   */
  const handleListAgents = async (_request: FastifyRequest, reply: FastifyReply) => {
    const agents = telemetryIngestionService.listAgents();
    return reply.send({ success: true, count: agents.length, data: agents });
  };

  app.get("/api/v1/edge/agents", handleListAgents);
  app.get("/v1/edge/agents", handleListAgents);

  /**
   * GET /api/v1/edge/agents/:id/liveness
   */
  const handleGetAgentLiveness = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const liveness = telemetryIngestionService.getAgentLiveness(params.id);
    if (!liveness) {
      return reply.status(404).send({ success: false, error: "Agent not found" });
    }
    return reply.send({ success: true, data: liveness });
  };

  app.get("/api/v1/edge/agents/:id/liveness", handleGetAgentLiveness);
  app.get("/v1/edge/agents/:id/liveness", handleGetAgentLiveness);

  /**
   * GET /api/v1/telemetry/branches/:branchId/current
   */
  const handleGetBranchCurrent = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const current = telemetryIngestionService.getBranchCurrentState(params.branchId);
    if (!current) {
      return reply.status(404).send({ success: false, error: "Branch telemetry state not found" });
    }
    return reply.send({ success: true, data: current });
  };

  app.get("/api/v1/telemetry/branches/:branchId/current", handleGetBranchCurrent);
  app.get("/v1/telemetry/branches/:branchId/current", handleGetBranchCurrent);
}
