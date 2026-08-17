import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  chaosRunnerService,
  ChaosRunnerService,
} from "../services/chaos-runner.service.js";

const runExperimentSchema = z.object({
  scenario: z.enum([
    "KILL_RECORDING_SERVICE",
    "KILL_REDIS",
    "KILL_POSTGRES",
    "DISCONNECT_CAMERA",
    "CHANGE_CAMERA_PASSWORD",
    "REBOOT_NVR",
    "FILL_DISK",
    "REMOVE_STORAGE",
    "ADD_PACKET_LOSS",
    "ADD_LATENCY",
    "DISCONNECT_BRANCH_WAN",
    "CORRUPT_SEGMENT",
    "KILL_MEDIA_SERVER",
  ]),
  targetId: z.string().min(1),
  branchId: z.string().min(1).default("BR-118"),
  durationSeconds: z.number().int().min(1).max(300).optional().default(5),
  parameters: z.record(z.unknown()).optional(),
  failoverNodeId: z.string().optional(),
});

const runMatrixSchema = z.object({
  branchId: z.string().min(1).default("BR-118"),
});

export async function registerChaosTestingRoutes(
  app: FastifyInstance,
  service: ChaosRunnerService = chaosRunnerService,
): Promise<void> {
  /**
   * POST /v1/chaos/experiments/run
   * Executes a single chaos fault injection scenario and returns 6-point recovery assertions.
   */
  app.post("/v1/chaos/experiments/run", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = runExperimentSchema.parse(request.body);
    const report = await service.runExperiment(body);
    return reply.status(200).send({
      success: true,
      report,
    });
  });

  /**
   * POST /v1/chaos/matrix/run
   * Runs the full automated 13-scenario chaos test matrix and computes overall resilience score.
   */
  app.post("/v1/chaos/matrix/run", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = runMatrixSchema.parse(request.body || {});
    const matrix = await service.runFullChaosMatrix(body.branchId);
    return reply.status(200).send({
      success: true,
      matrix,
    });
  });

  /**
   * GET /v1/chaos/matrix/latest
   * Returns the most recent 13-scenario matrix execution summary.
   */
  app.get("/v1/chaos/matrix/latest", async (_request: FastifyRequest, reply: FastifyReply) => {
    const latest = service.getLatestMatrixSummary();
    if (!latest) {
      // Auto-trigger a default run if none exists
      const fresh = await service.runFullChaosMatrix("BR-118");
      return reply.status(200).send(fresh);
    }
    return reply.status(200).send(latest);
  });

  /**
   * GET /v1/chaos/experiments
   * Lists recent chaos experiment reports.
   */
  app.get("/v1/chaos/experiments", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { limit?: string };
    const limit = query.limit ? Number.parseInt(query.limit, 10) : 50;
    const reports = service.listReports(limit);
    return reply.status(200).send({
      success: true,
      count: reports.length,
      reports,
    });
  });

  /**
   * GET /v1/chaos/experiments/:id
   * Retrieves single chaos report by experiment ID.
   */
  app.get("/v1/chaos/experiments/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const report = service.getReport(params.id);
    if (!report) {
      return reply.status(404).send({ error: "Experiment report not found" });
    }
    return reply.status(200).send({
      success: true,
      report,
    });
  });

  /**
   * GET /v1/chaos/scenarios
   * Lists all 13 supported chaos fault scenarios and target categories.
   */
  app.get("/v1/chaos/scenarios", async (_request: FastifyRequest, reply: FastifyReply) => {
    const scenarios = service.getSupportedScenarios();
    return reply.status(200).send({
      success: true,
      count: scenarios.length,
      scenarios,
    });
  });
}
