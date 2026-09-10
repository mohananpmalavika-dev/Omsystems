import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { AIQualityPlatformFacade } from "../ai-quality/services/ai-quality-platform.facade.js";

const registerModelSchema = z.object({
  detectorId: z.string().trim().min(1).max(128),
  version: z.string().trim().min(1).max(64),
  modelName: z.string().trim().min(1).max(256),
  framework: z.enum(["onnx", "tensorrt", "pytorch", "openvino", "native_ivs"]).default("tensorrt"),
  artifactUri: z.string().trim().min(1).max(2048),
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/i, "artifactSha256 must be a SHA-256 digest"),
  inputWidth: z.number().int().default(640),
  inputHeight: z.number().int().default(640),
  defaultThreshold: z.number().min(0.1).max(1.0).default(0.60),
  trainingDatasetId: z.string().trim().min(1).max(128).optional(),
  validationDatasetId: z.string().trim().min(1).max(128).optional(),
}).strict();

const evaluateModelSchema = z.object({
  datasetId: z.string().trim().min(1).max(128).optional(),
  hardwareId: z.string().trim().min(1).max(128).optional(),
  customThreshold: z.number().min(0.1).max(1.0).optional(),
}).strict();

const updateCameraTuningSchema = z.object({
  detectorId: z.string().trim().min(1).max(128),
  sensitivity: z.enum(["LOW", "MEDIUM", "HIGH", "CUSTOM"]).default("MEDIUM"),
  customThreshold: z.number().min(0.1).max(1.0).optional(),
  overrideReason: z.string().trim().min(8).max(1024).optional(),
}).strict().superRefine((value, context) => {
  if (value.sensitivity === "CUSTOM" && value.customThreshold === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["customThreshold"], message: "A custom sensitivity requires customThreshold" });
  }
  if (value.sensitivity === "CUSTOM" && !value.overrideReason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["overrideReason"], message: "A custom sensitivity requires an override reason" });
  }
});

const recordFeedbackSchema = z.object({
  alertId: z.string().trim().min(1).max(128),
  cameraId: z.string().trim().min(1).max(128),
  detectorId: z.string().trim().min(1).max(128),
  modelVersionId: z.string().trim().min(1).max(128),
  classification: z.enum(["true_positive", "false_positive", "uncertain"]),
  reasonCategory: z.enum(["reflection", "shadow", "animal", "headlight", "weather", "known_person", "other"]).optional(),
  notes: z.string().trim().max(4096).optional(),
}).strict();

export async function registerAiQualityRoutes(
  app: FastifyInstance,
  platform: AIQualityPlatformFacade,
) {
  const readRoles = new Set(["super_admin", "superadmin", "company_admin", "hq_admin", "admin", "security_officer", "auditor"]);
  const modelChangeRoles = new Set(["super_admin", "superadmin", "company_admin", "hq_admin", "admin"]);
  const feedbackRoles = new Set([...readRoles, "operator"]);
  const requireReadAccess = (request: FastifyRequest, reply: FastifyReply) => {
    const role = request.currentUser?.role;
    if (readRoles.has(role ?? "")) return true;
    reply.code(403).send({ error: "forbidden", message: "AI quality registry access requires an authorized security or administration role." });
    return false;
  };
  const requireModelChangeAccess = (request: FastifyRequest, reply: FastifyReply) => {
    const role = request.currentUser?.role;
    if (modelChangeRoles.has(role ?? "")) return true;
    reply.code(403).send({ error: "forbidden", message: "Only platform administrators can change model lifecycle state." });
    return false;
  };
  const requireFeedbackAccess = (request: FastifyRequest, reply: FastifyReply) => {
    if (feedbackRoles.has(request.currentUser?.role ?? "")) return true;
    reply.code(403).send({ error: "forbidden", message: "Operator feedback requires an authorized operations role." });
    return false;
  };
  const actor = (request: FastifyRequest) => ({
    userId: request.currentUser.id,
    userName: request.currentUser.displayName || request.currentUser.username || request.currentUser.id,
  });

  // 1. List detectors and active production models
  app.get("/v1/ai-quality/detectors", async (request, reply) => {
    if (!requireReadAccess(request, reply)) return;
    const detectors = await platform.detectorRepo.listDetectors();
    return { data: detectors };
  });

  // 2. Get single detector details with versions
  app.get("/v1/ai-quality/detectors/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireReadAccess(request, reply)) return;
    const { id } = request.params as { id: string };
    const detector = await platform.detectorRepo.getDetector(id);
    if (!detector) return reply.code(404).send({ error: "detector_not_found" });

    const models = await platform.detectorRepo.listModelVersions(id);
    return { detector, models };
  });

  // 3. List all model versions
  app.get("/v1/ai-quality/models", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireReadAccess(request, reply)) return;
    const detectorId = (request.query as any)?.detectorId;
    const models = await platform.detectorRepo.listModelVersions(detectorId);
    return { data: models };
  });

  // 4. Register new model version
  app.post("/v1/ai-quality/models/register", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireModelChangeAccess(request, reply)) return;
    const body = registerModelSchema.parse(request.body);

    const model = await platform.registerModelVersion({
      ...body,
      actor: actor(request),
    } as any);

    return reply.code(201).send({ model });
  });

  // 5. Get model evaluation benchmark results & scenario breakdowns
  app.get("/v1/ai-quality/models/:id/evaluation", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireReadAccess(request, reply)) return;
    const { id } = request.params as { id: string };
    const evaluation = await platform.evaluationRepo.getLatestEvaluationForModel(id);
    const certification = await platform.evaluationRepo.getCertification(id);

    if (!evaluation && !certification) {
      return reply.code(404).send({ error: "no_evaluation_found_for_model" });
    }

    return { evaluation, certification };
  });

  // 6. Run benchmark evaluation for model
  app.post("/v1/ai-quality/models/:id/evaluate", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireModelChangeAccess(request, reply)) return;
    const { id } = request.params as { id: string };
    const body = evaluateModelSchema.parse(request.body || {});
    try {
      const evaluation = await platform.evaluateModel(id, body.datasetId, body.hardwareId, body.customThreshold);
      return { evaluation };
    } catch (error) {
      const message = error instanceof Error ? error.message : "evaluation_failed";
      const statusCode = error instanceof Error && error.name === "BenchmarkUnavailableError" ? 503 : 400;
      return reply.code(statusCode).send({ error: statusCode === 503 ? "benchmark_runner_unavailable" : "evaluation_failed", message });
    }
  });

  // 7. Evaluate and issue model certification
  app.post("/v1/ai-quality/models/:id/certify", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireModelChangeAccess(request, reply)) return;
    const { id } = request.params as { id: string };

    const certification = await platform.certificationService.evaluateCertification(
      id,
      actor(request),
    );

    return { certification };
  });

  // 8. Deploy certified model to production fleet
  app.post("/v1/ai-quality/models/:id/deploy", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireModelChangeAccess(request, reply)) return;
    const { id } = request.params as { id: string };

    try {
      const result = await platform.deployModelToProduction(id, actor(request));

      return result;
    } catch (err: any) {
      if (err.name === "ModelNotCertifiedError") {
        return reply.code(403).send({
          error: "model_not_certified",
          message: err.message,
        });
      }
      return reply.code(400).send({ error: "deployment_failed", message: err.message });
    }
  });

  // 9. Get per-camera detector tuning
  app.get("/v1/ai-quality/cameras/:id/tuning", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireReadAccess(request, reply)) return;
    const { id } = request.params as { id: string };
    const detectorId = (request.query as any)?.detectorId || "det-intrusion";

    const config = await platform.cameraTuning.getEffectiveConfiguration(
      request.currentUser.tenantId,
      "branch-default",
      id,
      detectorId,
    );

    const recommendation = await platform.cameraTuning.generateThresholdRecommendation(
      id,
      detectorId,
    );

    return { configuration: config, recommendation };
  });

  // 10. Update per-camera detector tuning
  app.put("/v1/ai-quality/cameras/:id/tuning", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireModelChangeAccess(request, reply)) return;
    const { id } = request.params as { id: string };
    const body = updateCameraTuningSchema.parse(request.body);

    const config = await platform.cameraTuning.updateConfiguration({
      tenantId: request.currentUser.tenantId,
      branchId: "branch-default",
      cameraId: id,
      detectorId: body.detectorId,
      sensitivity: body.sensitivity,
      customThreshold: body.customThreshold,
      overrideReason: body.overrideReason,
      actor: actor(request),
    });

    return { configuration: config };
  });

  // 11. Record operator TP/FP feedback
  app.post("/v1/ai-quality/feedback", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireFeedbackAccess(request, reply)) return;
    const body = recordFeedbackSchema.parse(request.body);

    const feedback = await platform.recordOperatorFeedback({
      ...body,
      actor: actor(request),
    } as any);

    return { feedback };
  });

  // 12. Central AI Fleet Quality Health & Drift Monitor
  app.get("/v1/ai-quality/health", async (request, reply) => {
    if (!requireReadAccess(request, reply)) return;
    const health = await platform.getFleetQualityHealth();
    return { health };
  });

  // 13. Audit Log
  app.get("/v1/ai-quality/audit", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireReadAccess(request, reply)) return;
    const targetId = (request.query as any)?.targetId;
    const events = await platform.auditRepo.listAuditEvents(targetId);
    return { data: events };
  });
}
