/**
 * Unified Operations & Product Surface REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { unifiedOperationsService } from "../operations/index.js";

export async function registerUnifiedOperationsRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/operations/command-center
   */
  const handleGetCommandCenter = async (_request: FastifyRequest, reply: FastifyReply) => {
    const summary = await unifiedOperationsService.getCommandCenterSummary();
    return reply.send({ success: true, data: summary });
  };

  app.get("/api/v1/operations/command-center", handleGetCommandCenter);
  app.get("/v1/operations/command-center", handleGetCommandCenter);

  /**
   * GET /api/v1/operations/attention-required
   */
  const handleGetAttentionRequired = async (_request: FastifyRequest, reply: FastifyReply) => {
    const summary = await unifiedOperationsService.getCommandCenterSummary();
    return reply.send({ success: true, count: summary.attentionRequired.length, data: summary.attentionRequired });
  };

  app.get("/api/v1/operations/attention-required", handleGetAttentionRequired);
  app.get("/v1/operations/attention-required", handleGetAttentionRequired);

  /**
   * GET /api/v1/operations/branches
   */
  const handleGetBranches = async (_request: FastifyRequest, reply: FastifyReply) => {
    const branches = await unifiedOperationsService.getFleetBranchSummaries();
    return reply.send({ success: true, count: branches.length, data: branches });
  };

  app.get("/api/v1/operations/branches", handleGetBranches);
  app.get("/v1/operations/branches", handleGetBranches);

  /**
   * GET /api/v1/operations/branches/:id/workspace
   */
  const handleGetBranchWorkspace = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const workspace = await unifiedOperationsService.getBranch360Workspace(params.id);
    return reply.send({ success: true, data: workspace });
  };

  app.get("/api/v1/operations/branches/:id/workspace", handleGetBranchWorkspace);
  app.get("/v1/operations/branches/:id/workspace", handleGetBranchWorkspace);

  /**
   * GET /api/v1/operations/universal-search
   */
  const handleUniversalSearch = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query as any) || {};
    const result = await unifiedOperationsService.getUniversalSearch(query.q || "");
    return reply.send({ success: true, count: result.matches.length, data: result });
  };

  app.get("/api/v1/operations/universal-search", handleUniversalSearch);
  app.get("/v1/operations/universal-search", handleUniversalSearch);
}
