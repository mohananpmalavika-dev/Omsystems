/**
 * Capacity Benchmark REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { capacityBenchmarkService, DEFAULT_TIER_A_SLO_BUDGET } from "../performance/index.js";

export async function registerPerformanceBenchmarkRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/benchmarks/run
   */
  const handleRunBenchmark = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as any) || {};
    const tier = body.tier || "TIER_A";
    const scorecard = await capacityBenchmarkService.runBenchmark(tier, body.customSlo);
    return reply.status(201).send({ success: true, data: scorecard });
  };

  app.post("/api/v1/benchmarks/run", handleRunBenchmark);
  app.post("/v1/benchmarks/run", handleRunBenchmark);

  /**
   * GET /api/v1/benchmarks/latest
   */
  const handleGetLatest = async (_request: FastifyRequest, reply: FastifyReply) => {
    let scorecard = capacityBenchmarkService.getLatestScorecard();
    if (!scorecard) {
      scorecard = await capacityBenchmarkService.runBenchmark("TIER_A");
    }
    return reply.send({ success: true, data: scorecard });
  };

  app.get("/api/v1/benchmarks/latest", handleGetLatest);
  app.get("/v1/benchmarks/latest", handleGetLatest);

  /**
   * GET /api/v1/benchmarks/slo-budget
   */
  const handleGetSloBudget = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ success: true, data: DEFAULT_TIER_A_SLO_BUDGET });
  };

  app.get("/api/v1/benchmarks/slo-budget", handleGetSloBudget);
  app.get("/v1/benchmarks/slo-budget", handleGetSloBudget);
}
