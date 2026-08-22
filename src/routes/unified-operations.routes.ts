/**
 * Unified Operations & Product Surface REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { unifiedOperationsService } from "../operations/index.js";
import type { ControlPlaneStore } from "../control-plane-store.js";

export async function registerUnifiedOperationsRoutes(app: FastifyInstance, store?: ControlPlaneStore) {
  const requireUser = (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.currentUser) {
      reply.code(401).send({ success: false, error: "Authentication required" });
      return null;
    }
    return request.currentUser;
  };
  /**
   * GET /api/v1/operations/command-center
   */
  const handleGetCommandCenter = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const summary = await unifiedOperationsService.getCommandCenterSummary(user.tenantId, store, user);
    return reply.send({ success: true, data: summary });
  };

  app.get("/api/v1/operations/command-center", handleGetCommandCenter);
  app.get("/v1/operations/command-center", handleGetCommandCenter);

  /**
   * GET /api/v1/operations/attention-required
   */
  const handleGetAttentionRequired = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const summary = await unifiedOperationsService.getCommandCenterSummary(user.tenantId, store, user);
    return reply.send({ success: true, count: summary.attentionRequired.length, data: summary.attentionRequired });
  };

  app.get("/api/v1/operations/attention-required", handleGetAttentionRequired);
  app.get("/v1/operations/attention-required", handleGetAttentionRequired);

  /**
   * GET /api/v1/operations/branches
   */
  const handleGetBranches = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const branches = await unifiedOperationsService.getFleetBranchSummaries(user.tenantId, store, user);
    return reply.send({ success: true, count: branches.length, data: branches });
  };

  app.get("/api/v1/operations/branches", handleGetBranches);
  app.get("/v1/operations/branches", handleGetBranches);

  /**
   * GET /api/v1/operations/branches/:id/workspace
   */
  const handleGetBranchWorkspace = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const user = requireUser(request, reply);
    if (!user) return;
    const decision = store ? await store.checkAccess(user, "recording:view", params.id) : undefined;
    if (!decision?.allowed) return reply.code(403).send({ success: false, error: "Access denied" });
    const workspace = await unifiedOperationsService.getBranch360Workspace(params.id, user.tenantId, store, user);
    if (!workspace) return reply.code(404).send({ success: false, error: "Branch workspace not found" });
    return reply.send({ success: true, data: workspace });
  };

  app.get("/api/v1/operations/branches/:id/workspace", handleGetBranchWorkspace);
  app.get("/v1/operations/branches/:id/workspace", handleGetBranchWorkspace);

  /**
   * GET /api/v1/operations/universal-search
   */
  const handleUniversalSearch = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query as any) || {};
    const user = requireUser(request, reply);
    if (!user) return;
    const result = await unifiedOperationsService.getUniversalSearch(query.q || "", user.tenantId, store, user);
    return reply.send({ success: true, count: result.matches.length, data: result });
  };

  app.get("/api/v1/operations/universal-search", handleUniversalSearch);
  app.get("/v1/operations/universal-search", handleUniversalSearch);
}
