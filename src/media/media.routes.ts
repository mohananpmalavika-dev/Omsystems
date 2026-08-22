import type { FastifyInstance } from "fastify";

export async function mediaRoutes(app: FastifyInstance) {
  // Minimal stub for optional media orchestration routes.
  app.get("/health", async () => ({ status: "ok" }));
}
