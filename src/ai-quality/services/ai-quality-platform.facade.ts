import { randomUUID } from "node:crypto";
import type {
  Detector,
  ModelVersion,
  DatasetVersion,
  HardwareProfile,
  EvaluationRun,
  ModelCertification,
  CameraDetectorConfiguration,
  AlertQualityFeedback,
  DetectorRuntimeQuality,
  AIQualityAuditEvent,
  SensitivityLevel,
} from "../domain/ai-quality.types.js";
import { DetectorRegistryRepository } from "../repositories/detector-registry.repository.js";
import { EvaluationRepository } from "../repositories/evaluation.repository.js";
import { CameraTuningRepository } from "../repositories/camera-tuning.repository.js";
import { AIQualityAuditRepository } from "../repositories/ai-quality-audit.repository.js";
import { EvaluationEngineService } from "./evaluation-engine.service.js";
import { ModelCertificationService } from "./model-certification.service.js";
import { CameraTuningService } from "./camera-tuning.service.js";

export class AIQualityPlatformFacade {
  readonly detectorRepo: DetectorRegistryRepository;
  readonly evaluationRepo: EvaluationRepository;
  readonly cameraTuningRepo: CameraTuningRepository;
  readonly auditRepo: AIQualityAuditRepository;

  readonly evaluationEngine: EvaluationEngineService;
  readonly certificationService: ModelCertificationService;
  readonly cameraTuning: CameraTuningService;

  constructor() {
    this.detectorRepo = new DetectorRegistryRepository();
    this.evaluationRepo = new EvaluationRepository();
    this.cameraTuningRepo = new CameraTuningRepository();
    this.auditRepo = new AIQualityAuditRepository();

    this.evaluationEngine = new EvaluationEngineService(this.evaluationRepo);
    this.certificationService = new ModelCertificationService(
      this.evaluationRepo,
      this.detectorRepo,
      this.auditRepo,
    );
    this.cameraTuning = new CameraTuningService(
      this.cameraTuningRepo,
      this.detectorRepo,
      this.auditRepo,
    );
  }

  /**
   * Register a new model version.
   */
  async registerModelVersion(input: {
    detectorId: string;
    version: string;
    modelName: string;
    framework: ModelVersion["framework"];
    artifactUri: string;
    artifactSha256: string;
    inputWidth?: number;
    inputHeight?: number;
    defaultThreshold?: number;
    trainingDatasetId?: string;
    validationDatasetId?: string;
    actor: { userId: string; userName: string };
  }): Promise<ModelVersion> {
    const id = `model-${input.detectorId.replace("det-", "")}-v${input.version.replace(/\./g, "-")}`;
    const model: ModelVersion = {
      id,
      detectorId: input.detectorId,
      version: input.version,
      modelName: input.modelName,
      framework: input.framework,
      artifactUri: input.artifactUri,
      artifactSha256: input.artifactSha256,
      inputWidth: input.inputWidth || 640,
      inputHeight: input.inputHeight || 640,
      defaultThreshold: input.defaultThreshold || 0.60,
      trainingDatasetId: input.trainingDatasetId,
      validationDatasetId: input.validationDatasetId,
      lifecycle: "candidate",
      createdAt: new Date().toISOString(),
      createdBy: input.actor.userName,
    };

    await this.detectorRepo.saveModelVersion(model);

    await this.auditRepo.appendAuditEvent({
      eventType: "MODEL_REGISTERED",
      targetId: model.id,
      actor: input.actor,
      details: { version: model.version, modelName: model.modelName, sha256: model.artifactSha256 },
    });

    return model;
  }

  /**
   * Run benchmark evaluation for a model version.
   */
  async evaluateModel(
    modelVersionId: string,
    datasetId?: string,
    hardwareId?: string,
    customThreshold?: number,
  ): Promise<EvaluationRun> {
    const model = await this.detectorRepo.getModelVersion(modelVersionId);
    if (!model) throw new Error(`Model ${modelVersionId} not found`);

    const dataset = await this.detectorRepo.getDatasetVersion(
      datasetId || model.validationDatasetId || "ds-bank-intrusion-2026-08",
    );
    if (!dataset) throw new Error(`Dataset not found`);

    const hardware = await this.detectorRepo.getHardwareProfile(
      hardwareId || "hw-rtx-a4000",
    );
    if (!hardware) throw new Error(`Hardware profile not found`);

    const result = await this.evaluationEngine.runEvaluation(model, dataset, hardware, customThreshold);

    await this.auditRepo.appendAuditEvent({
      eventType: "MODEL_EVALUATED",
      targetId: modelVersionId,
      actor: { userId: "system", userName: "AI Benchmark Worker" },
      details: {
        precision: result.overallMetrics.precision,
        recall: result.overallMetrics.recall,
        f1: result.overallMetrics.f1,
        falseAlertsPerHour: result.overallMetrics.falseAlertsPerCameraHour,
        fps: result.overallMetrics.fpsAverage,
      },
    });

    return result;
  }

  /**
   * Deploy model to production fleet with mandatory certification guard.
   */
  async deployModelToProduction(
    modelVersionId: string,
    actor: { userId: string; userName: string },
  ): Promise<{ status: string; model: ModelVersion; detector: Detector }> {
    // 1. Enforce certification gate
    await this.certificationService.assertCanDeployToProduction(modelVersionId);

    const model = await this.detectorRepo.getModelVersion(modelVersionId);
    if (!model) throw new Error(`Model ${modelVersionId} not found`);

    const detector = await this.detectorRepo.getDetector(model.detectorId);
    if (!detector) throw new Error(`Detector ${model.detectorId} not found`);

    // 2. Promote model to production
    model.lifecycle = "production";
    detector.currentProductionModelId = model.id;
    detector.updatedAt = new Date().toISOString();

    await this.detectorRepo.saveModelVersion(model);
    await this.detectorRepo.saveDetector(detector);

    await this.auditRepo.appendAuditEvent({
      eventType: "MODEL_DEPLOYED",
      targetId: modelVersionId,
      actor,
      details: { detectorId: detector.id, detectorName: detector.name, version: model.version },
    });

    return { status: "deployed_to_production", model, detector };
  }

  /**
   * Record operator TP/FP quality feedback.
   */
  async recordOperatorFeedback(input: {
    alertId: string;
    cameraId: string;
    detectorId: string;
    modelVersionId: string;
    classification: "true_positive" | "false_positive" | "uncertain";
    reasonCategory?: "reflection" | "shadow" | "animal" | "headlight" | "weather" | "known_person" | "other";
    notes?: string;
    actor: { userId: string; userName: string };
  }): Promise<AlertQualityFeedback> {
    return this.auditRepo.recordFeedback({
      alertId: input.alertId,
      cameraId: input.cameraId,
      detectorId: input.detectorId,
      modelVersionId: input.modelVersionId,
      classification: input.classification,
      reasonCategory: input.reasonCategory,
      notes: input.notes,
      operatorId: input.actor.userId,
      operatorName: input.actor.userName,
    });
  }

  /**
   * Get central AI fleet quality & drift health summary across all branches.
   */
  async getFleetQualityHealth(): Promise<{
    certifiedDetectorsCount: number;
    modelsInProductionCount: number;
    modelsUnderValidationCount: number;
    qualityWarningsCount: number;
    criticalDriftCount: number;
    detectors: DetectorRuntimeQuality[];
    recentAuditEvents: AIQualityAuditEvent[];
  }> {
    const detectors = await this.detectorRepo.listDetectors();
    const models = await this.detectorRepo.listModelVersions();

    const certifiedDetectorsCount = detectors.filter((d) => d.status === "certified").length;
    const modelsInProductionCount = models.filter((m) => m.lifecycle === "production").length;
    const modelsUnderValidationCount = models.filter((m) => m.lifecycle === "candidate" || m.lifecycle === "validated").length;

    const runtimeQualities: DetectorRuntimeQuality[] = [];
    let qualityWarnings = 0;
    let criticalDrifts = 0;

    for (const detector of detectors) {
      const prodModel = detector.currentProductionModelId
        ? await this.detectorRepo.getModelVersion(detector.currentProductionModelId)
        : null;

      const runtime = await this.auditRepo.calculateRuntimeQuality(
        detector.id,
        detector.code,
        prodModel?.version || "1.0.0",
      );

      if (runtime.driftStatus === "WARNING") qualityWarnings++;
      if (runtime.driftStatus === "CRITICAL_DRIFT") criticalDrifts++;

      runtimeQualities.push(runtime);
    }

    const recentAudits = await this.auditRepo.listAuditEvents();

    return {
      certifiedDetectorsCount,
      modelsInProductionCount,
      modelsUnderValidationCount,
      qualityWarningsCount: qualityWarnings,
      criticalDriftCount: criticalDrifts,
      detectors: runtimeQualities,
      recentAuditEvents: recentAudits.slice(-10).reverse(),
    };
  }
}
