import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { AIQualityPlatformFacade } from "../ai-quality/services/ai-quality-platform.facade.js";

const registerModelSchema = z.object({
  detectorId: z.string(),
  version: z.string(),
  modelName: z.string(),
  framework: z.enum(["onnx", "tensorrt", "pytorch", "openvino", "native_ivs"]).default("tensorrt"),
  artifactUri: z.string(),
  artifactSha256: z.string(),
  inputWidth: z.number().int().default(640),
  inputHeight: z.number().int().default(640),
  defaultThreshold: z.number().min(0.1).max(1.0).default(0.60),
  trainingDatasetId: z.string().optional(),
  validationDatasetId: z.string().optional(),
});

const evaluateModelSchema = z.object({
  datasetId: z.string().optional(),
  hardwareId: z.string().optional(),
  customThreshold: z.number().min(0.1).max(1.0).optional(),
});

const updateCameraTuningSchema = z.object({
  detectorId: z.string(),
  sensitivity: z.enum(["LOW", "MEDIUM", "HIGH", "CUSTOM"]).default("MEDIUM"),
  customThreshold: z.number().min(0.1).max(1.0).optional(),
  overrideReason: z.string().optional(),
});

const recordFeedbackSchema = z.object({
  alertId: z.string(),
  cameraId: z.string(),
  detectorId: z.string(),
  modelVersionId: z.string(),
  classification: z.enum(["true_positive", "false_positive", "uncertain"]),
  reasonCategory: z.enum(["reflection", "shadow", "animal", "headlight", "weather", "known_person", "other"]).optional(),
  notes: z.string().optional(),
});

export async function registerAiQualityRoutes(
  app: FastifyInstance,
  platform: AIQualityPlatformFacade,
) {
  // 1. List detectors and active production models
  app.get("/v1/ai-quality/detectors", async () => {
    const detectors = await platform.detectorRepo.listDetectors();
    return { data: detectors };
  });

  // 2. Get single detector details with versions
  app.get("/v1/ai-quality/detectors/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const detector = await platform.detectorRepo.getDetector(id);
    if (!detector) return reply.code(404).send({ error: "detector_not_found" });

    const models = await platform.detectorRepo.listModelVersions(id);
    return { detector, models };
  });

  // 3. List all model versions
  app.get("/v1/ai-quality/models", async (request: FastifyRequest) => {
    const detectorId = (request.query as any)?.detectorId;
    const models = await platform.detectorRepo.listModelVersions(detectorId);
    return { data: models };
  });

  // 4. Register new model version
  app.post("/v1/ai-quality/models/register", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = registerModelSchema.parse(request.body);
    const user = (request as any).currentUser || { id: "usr-ai-eng", displayName: "AI Engineer" };

    const model = await platform.registerModelVersion({
      ...body,
      actor: {
        userId: user.id,
        userName: user.displayName || user.username || "AI Engineer",
      },
    } as any);

    return reply.code(201).send({ model });
  });

  // 5. Get model evaluation benchmark results & scenario breakdowns
  app.get("/v1/ai-quality/models/:id/evaluation", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const evaluation = await platform.evaluationRepo.getLatestEvaluationForModel(id);
    const certification = await platform.evaluationRepo.getCertification(id);

    if (!evaluation && !certification) {
      return reply.code(404).send({ error: "no_evaluation_found_for_model" });
    }

    return { evaluation, certification };
  });

  // 6. Run benchmark evaluation for model
  app.post("/v1/ai-quality/models/:id/evaluate", async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const body = evaluateModelSchema.parse(request.body || {});

    const evaluation = await platform.evaluateModel(
      id,
      body.datasetId,
      body.hardwareId,
      body.customThreshold,
    );

    return { evaluation };
  });

  // 7. Evaluate and issue model certification
  app.post("/v1/ai-quality/models/:id/certify", async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const user = (request as any).currentUser || { id: "usr-head-ai", displayName: "AI Safety Officer" };

    const certification = await platform.certificationService.evaluateCertification(
      id,
      {
        userId: user.id,
        userName: user.displayName || user.username || "AI Safety Officer",
      },
    );

    return { certification };
  });

  // 8. Deploy certified model to production fleet
  app.post("/v1/ai-quality/models/:id/deploy", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).currentUser || { id: "usr-admin", displayName: "Security Administrator" };

    try {
      const result = await platform.deployModelToProduction(id, {
        userId: user.id,
        userName: user.displayName || user.username || "Security Administrator",
      });

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
  app.get("/v1/ai-quality/cameras/:id/tuning", async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const detectorId = (request.query as any)?.detectorId || "det-intrusion";

    const config = await platform.cameraTuning.getEffectiveConfiguration(
      "tenant-default",
      "branch-default",
      id,
      detectorId,
    );

    const recommendation = await platform.cameraTuning.generateThresholdRecommendation(
      id,
      detectorId,
      0.18, // Simulated observed rate for recommendation preview
    );

    return { configuration: config, recommendation };
  });

  // 10. Update per-camera detector tuning
  app.put("/v1/ai-quality/cameras/:id/tuning", async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const body = updateCameraTuningSchema.parse(request.body);
    const user = (request as any).currentUser || { id: "usr-admin", displayName: "Security Administrator" };

    const config = await platform.cameraTuning.updateConfiguration({
      tenantId: "tenant-default",
      branchId: "branch-default",
      cameraId: id,
      detectorId: body.detectorId,
      sensitivity: body.sensitivity,
      customThreshold: body.customThreshold,
      overrideReason: body.overrideReason,
      actor: {
        userId: user.id,
        userName: user.displayName || user.username || "Security Administrator",
      },
    });

    return { configuration: config };
  });

  // 11. Record operator TP/FP feedback
  app.post("/v1/ai-quality/feedback", async (request: FastifyRequest) => {
    const body = recordFeedbackSchema.parse(request.body);
    const user = (request as any).currentUser || { id: "usr-operator-1", displayName: "SOC Operator" };

    const feedback = await platform.recordOperatorFeedback({
      ...body,
      actor: {
        userId: user.id,
        userName: user.displayName || user.username || "SOC Operator",
      },
    } as any);

    return { feedback };
  });

  // 12. Central AI Fleet Quality Health & Drift Monitor
  app.get("/v1/ai-quality/health", async () => {
    const health = await platform.getFleetQualityHealth();
    return { health };
  });

  // 13. Audit Log
  app.get("/v1/ai-quality/audit", async (request: FastifyRequest) => {
    const targetId = (request.query as any)?.targetId;
    const events = await platform.auditRepo.listAuditEvents(targetId);
    return { data: events };
  });
}
