import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildOperationalGraph } from "../services/command-center/operational-kg.js";
import { buildTimeline } from "../services/command-center/timeline.js";
import { analyze } from "../services/command-center/rca.js";

export async function registerCommandCenterRoutes(app: FastifyInstance, store: any) {
  app.get('/v1/command-center/branches/:branchId/diagnosis', async (request, reply) => {
    if (!request.currentUser?.tenantId) return reply.code(401).send({ error: 'unauthorized' });
    const params = z.object({ branchId: z.string().min(1) }).parse(request.params);
    const graph = await buildOperationalGraph(store, request.currentUser, params.branchId);
    const timeline = await buildTimeline(store, request.currentUser.tenantId, params.branchId);
    const analysis = analyze(graph, timeline);
    return { graph, timeline, analysis, generatedAt: new Date().toISOString() };
  });

  app.post('/v1/command-center/query', async (request, reply) => {
    if (!request.currentUser?.tenantId) return reply.code(401).send({ error: 'unauthorized' });
    const body = z.object({ branchId: z.string().min(1), question: z.string().min(1) }).parse(request.body);
    const graph = await buildOperationalGraph(store, request.currentUser, body.branchId);
    const timeline = await buildTimeline(store, request.currentUser.tenantId, body.branchId);
    const analysis = analyze(graph, timeline);

    // Simple natural-language assembly (evidence-backed)
    const status = (graph.cameras || []).filter((c: any) => (c.status ?? 'unknown') !== 'online').length > 0 ? 'Degraded' : 'Healthy';
    const replyText = {
      status: `${(graph.branch as any)?.name ?? body.branchId} is currently ${status}.`,
      rootCause: analysis.rootCause,
      evidence: analysis.evidence,
      impact: { camerasAffected: analysis.impactedEntities.length },
      recommendation: analysis.rootCause === 'unknown' ? 'Collect more telemetry' : (analysis.rootCause === 'power_failure' ? 'Check site power and UPS' : 'Verify recorder and network'),
      confidence: analysis.confidence,
    };

    await store.writeAudit?.({ tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id, action: 'command_center.query', resourceNodeId: body.branchId, outcome: 'success', details: { question: body.question } }).catch(() => {});

    return { graph, timeline, analysis, reply: replyText, generatedAt: new Date().toISOString() };
  });
}
