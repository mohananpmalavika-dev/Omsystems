/**
 * CEO Screen — Fastify REST & SSE Routes
 *
 * Exposes the 5-Question Executive Command Center endpoints.
 *
 * GET  /api/v1/ceo-screen                     — Complete Master 5-Question Snapshot
 * GET  /api/v1/ceo-screen/what-is-broken      — 1. What is broken?
 * GET  /api/v1/ceo-screen/what-will-break     — 2. What will break?
 * GET  /api/v1/ceo-screen/why                 — 3. Why? (Root cause attribution)
 * GET  /api/v1/ceo-screen/business-impact     — 4. What is the business impact?
 * GET  /api/v1/ceo-screen/actions             — 5. What should I do?
 * POST /api/v1/ceo-screen/actions/:actionId/execute — 1-Click Action Execution
 * POST /api/v1/ceo-screen/reset               — Reset to benchmark scenario
 * GET  /api/v1/ceo-screen/stream              — Server-Sent Events (SSE) live updates
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { ceoScreenEngine } from "../ceo-command-center/services/ceo-screen-engine.js";

export async function registerCeoScreenRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/ceo-screen — Full 5-Question Executive Master Snapshot
  app.get("/api/v1/ceo-screen", async (_req: FastifyRequest, reply: FastifyReply) => {
    const snapshot = ceoScreenEngine.getSnapshot();
    return reply.status(200).send(snapshot);
  });

  // GET /api/v1/ceo-screen/what-is-broken — Question 1
  app.get("/api/v1/ceo-screen/what-is-broken", async (_req: FastifyRequest, reply: FastifyReply) => {
    const data = ceoScreenEngine.getWhatIsBroken();
    return reply.status(200).send(data);
  });

  // GET /api/v1/ceo-screen/what-will-break — Question 2
  app.get("/api/v1/ceo-screen/what-will-break", async (_req: FastifyRequest, reply: FastifyReply) => {
    const data = ceoScreenEngine.getWhatWillBreak();
    return reply.status(200).send(data);
  });

  // GET /api/v1/ceo-screen/why — Question 3
  app.get("/api/v1/ceo-screen/why", async (_req: FastifyRequest, reply: FastifyReply) => {
    const data = ceoScreenEngine.getWhy();
    return reply.status(200).send(data);
  });

  // GET /api/v1/ceo-screen/business-impact — Question 4
  app.get("/api/v1/ceo-screen/business-impact", async (_req: FastifyRequest, reply: FastifyReply) => {
    const data = ceoScreenEngine.getBusinessImpact();
    return reply.status(200).send(data);
  });

  // GET /api/v1/ceo-screen/actions — Question 5
  app.get("/api/v1/ceo-screen/actions", async (_req: FastifyRequest, reply: FastifyReply) => {
    const data = ceoScreenEngine.getWhatShouldIDo();
    return reply.status(200).send(data);
  });

  // POST /api/v1/ceo-screen/actions/:actionId/execute — 1-Click Action Execution
  app.post(
    "/api/v1/ceo-screen/actions/:actionId/execute",
    async (
      req: FastifyRequest<{ Params: { actionId: string }; Body?: { operatorId?: string } }>,
      reply: FastifyReply,
    ) => {
      const { actionId } = req.params;
      const operatorId = req.body?.operatorId || "ceo-executive";

      try {
        const result = ceoScreenEngine.executeAction(actionId, operatorId);
        return reply.status(200).send({
          success: true,
          message: result.executionResult,
          action: result,
        });
      } catch (err: unknown) {
        const error = err as Error;
        return reply.status(404).send({
          success: false,
          error: error.message,
        });
      }
    },
  );

  // POST /api/v1/ceo-screen/reset — Reset to baseline scenario
  app.post("/api/v1/ceo-screen/reset", async (_req: FastifyRequest, reply: FastifyReply) => {
    ceoScreenEngine.seedDefaultExecutiveState();
    return reply.status(200).send({
      success: true,
      message: "CEO Screen state reset to benchmark scenario",
    });
  });

  // GET /api/v1/ceo-screen/stream — Server-Sent Events (SSE) Live Stream
  app.get("/api/v1/ceo-screen/stream", async (req: FastifyRequest, reply: FastifyReply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Send initial master snapshot
    const initialData = JSON.stringify(ceoScreenEngine.getSnapshot());
    reply.raw.write(`event: snapshot\ndata: ${initialData}\n\n`);

    // Keep connection alive or send updates if requested
    const interval = setInterval(() => {
      const liveData = JSON.stringify(ceoScreenEngine.getSnapshot());
      reply.raw.write(`event: snapshot\ndata: ${liveData}\n\n`);
    }, 5000);

    req.raw.on("close", () => {
      clearInterval(interval);
    });
  });
}
