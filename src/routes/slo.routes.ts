/**
 * SLO REST API Routes
 *
 * Mounted at /api/v1/slo
 *
 * GET  /api/v1/slo                — Full SLO report (all windows + violations)
 * GET  /api/v1/slo/definitions    — Human-readable SLO definition catalogue
 * GET  /api/v1/slo/violations     — Active violations only
 * GET  /api/v1/slo/:sloId         — Single SLO window detail
 * POST /api/v1/slo/record         — Record a measurement sample (internal use)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SLO_DEFINITIONS, SLO_ORDER } from "../slo/slo-definitions.js";
import { sloEngine } from "../slo/slo-measurement-engine.js";
import { buildDefinitionCatalogue } from "../slo/slo-reporter.js";
import type { SloId, SloMeasurement } from "../slo/slo-types.js";

interface RecordBody {
  sloId: string;
  valueMs?: number;
  success: boolean;
  context?: Record<string, string>;
}

export async function registerSloRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/slo — full report
  app.get("/api/v1/slo", async (_req: FastifyRequest, reply: FastifyReply) => {
    const report = sloEngine.buildReport();
    return reply.status(200).send(report);
  });

  // GET /api/v1/slo/definitions — definition catalogue
  app.get(
    "/api/v1/slo/definitions",
    async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.status(200).send(buildDefinitionCatalogue());
    },
  );

  // GET /api/v1/slo/violations — active violations
  app.get(
    "/api/v1/slo/violations",
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const violations = sloEngine.getAllViolations();
      return reply.status(200).send({ violations, count: violations.length });
    },
  );

  // GET /api/v1/slo/:sloId — single SLO window
  app.get(
    "/api/v1/slo/:sloId",
    async (
      req: FastifyRequest<{ Params: { sloId: string } }>,
      reply: FastifyReply,
    ) => {
      const { sloId } = req.params;

      if (!SLO_DEFINITIONS[sloId as SloId]) {
        return reply.status(404).send({
          error: "SLO_NOT_FOUND",
          message: `Unknown SLO ID: ${sloId}`,
          validIds: SLO_ORDER,
        });
      }

      const window = sloEngine.computeWindow(sloId as SloId);
      const def = SLO_DEFINITIONS[sloId as SloId];

      return reply.status(200).send({
        definition: {
          id: def.id,
          name: def.name,
          kind: def.kind,
          targetMs: def.targetMs,
          targetPct: def.targetPct,
          windowSeconds: def.windowSeconds,
          errorBudgetPct: def.errorBudgetPct,
          description: def.description,
        },
        window,
      });
    },
  );

  // POST /api/v1/slo/record — record a measurement
  app.post(
    "/api/v1/slo/record",
    async (
      req: FastifyRequest<{ Body: RecordBody }>,
      reply: FastifyReply,
    ) => {
      const body = req.body;

      if (!body || typeof body.sloId !== "string") {
        return reply.status(400).send({
          error: "INVALID_BODY",
          message: "sloId (string) and success (boolean) are required",
        });
      }

      if (!SLO_DEFINITIONS[body.sloId as SloId]) {
        return reply.status(400).send({
          error: "UNKNOWN_SLO_ID",
          message: `Unknown SLO ID: ${body.sloId}`,
          validIds: SLO_ORDER,
        });
      }

      const measurement: SloMeasurement = {
        sloId: body.sloId as SloId,
        observedAt: new Date(),
        valueMs: body.valueMs,
        success: body.success,
        context: body.context,
      };

      sloEngine.record(measurement);

      const updatedWindow = sloEngine.computeWindow(body.sloId as SloId);

      return reply.status(201).send({
        recorded: measurement,
        window: updatedWindow,
      });
    },
  );
}
