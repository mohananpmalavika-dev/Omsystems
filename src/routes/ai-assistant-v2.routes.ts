import type { FastifyInstance } from "fastify";

/**
 * AI Assistant V2 is intentionally unavailable until real camera-control,
 * authorization, audit, incident, storage, and detection providers are wired.
 * The previous route mutated camera rows and returned generated health data,
 * which was not a valid production integration.
 */
export default async function aiAssistantV2Routes(app: FastifyInstance) {
  const unavailable = async (_request: unknown, reply: any) => reply.code(503).send({
    success: false,
    error: "AI_ASSISTANT_PROVIDERS_NOT_CONFIGURED",
    message: "Configure authenticated assistant providers before enabling AI Assistant V2.",
  });

  app.post("/query", unavailable);
  app.get("/history/:sessionId", unavailable);
  app.delete("/history/:sessionId", unavailable);
  app.get("/statistics", unavailable);
}
