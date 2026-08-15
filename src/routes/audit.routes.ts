import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { AuditRepository } from "../database/audit-repository.js";

const branchComplianceQuery = z.object({
  branchNodeId: z.string().uuid().optional(),
});

/**
 * Register audit routes
 * Provides access to branch compliance summaries and audit reports
 */
export async function registerAuditRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  auditRepo: AuditRepository,
) {
  /**
   * GET /v1/audit/branch-compliance
   * Get comprehensive branch compliance summary
   */
  app.get("/v1/audit/branch-compliance", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = branchComplianceQuery.parse(request.query);
      const tenantId = request.currentUser.tenantId;

      const data = await auditRepo.getBranchComplianceSummary(
        tenantId,
        query.branchNodeId,
      );

      return { data };
    } catch (error) {
      request.log.error({ error }, "Failed to fetch branch compliance summary");
      return reply.code(500).send({
        error: "internal_server_error",
        message: "Failed to fetch branch compliance summary",
      });
    }
  });
}
