import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { buildLivePersonCountReport, loadPersonCountScope, type LivePersonCountService } from "../analytics/live-person-count.service.js";

const querySchema = z.object({
  branchId: z.string().min(1).max(200).optional(), regionId: z.string().min(1).max(200).optional(),
  zoneId: z.string().min(1).max(200).optional(), groupBy: z.enum(["branch", "region", "zone"]).default("branch"),
});
export async function registerLivePersonCountRoutes(app: FastifyInstance, store: ControlPlaneStore, service: LivePersonCountService | null) {
  app.get("/v1/reports/live-person-count", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({error: "invalid_person_count_filters"});
    const scope = await loadPersonCountScope(store, request.currentUser);
    if (!scope.branches.length && !scope.cameras.length) return reply.code(403).send({error: "forbidden"});
    if (!service) return reply.code(503).send({error: "live_person_count_unavailable"});
    const observations = await service.read(request.currentUser.tenantId, scope.cameras.map(camera => camera.id));
    return buildLivePersonCountReport(scope, observations, parsed.data);
  });
}
