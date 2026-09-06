import { randomUUID } from "node:crypto";
import type {
  CameraDetectorConfiguration,
  SensitivityLevel,
  AIProvenance,
  DetectorCode,
} from "../domain/ai-quality.types.js";
import type { CameraTuningRepository } from "../repositories/camera-tuning.repository.js";
import type { DetectorRegistryRepository } from "../repositories/detector-registry.repository.js";
import type { AIQualityAuditRepository } from "../repositories/ai-quality-audit.repository.js";

export interface ThresholdRecommendation {
  cameraId: string;
  detectorId: string;
  currentThreshold: number;
  observedFalseAlertsPerHour: number | null;
  fleetAverageFalseAlertsPerHour: number | null;
  recommendedThreshold: number;
  expectedFalseAlertsPerHour: number | null;
  expectedRecallImpactPercent: number | null;
  recommendationReason: string;
}

export class CameraTuningService {
  constructor(
    private readonly cameraTuningRepo: CameraTuningRepository,
    private readonly detectorRepo: DetectorRegistryRepository,
    private readonly auditRepo: AIQualityAuditRepository,
  ) {}

  /**
   * Get active detector configuration for a camera, falling back to detector defaults.
   */
  async getEffectiveConfiguration(
    tenantId: string,
    branchId: string,
    cameraId: string,
    detectorId: string,
  ): Promise<CameraDetectorConfiguration> {
    const existing = await this.cameraTuningRepo.getConfiguration(cameraId, detectorId);
    if (existing) return existing;

    const detector = await this.detectorRepo.getDetector(detectorId);
    const model = detector?.currentProductionModelId
      ? await this.detectorRepo.getModelVersion(detector.currentProductionModelId)
      : null;

    const defaultThreshold = model?.defaultThreshold ?? 0.60;

    const fallback: CameraDetectorConfiguration = {
      id: `tune-${cameraId}-${detectorId}`,
      tenantId,
      branchId,
      cameraId,
      detectorId,
      modelVersionId: model?.id || "model-default",
      enabled: true,
      sensitivity: "MEDIUM",
      confidenceThreshold: defaultThreshold,
      minimumDurationMs: 500,
      cooldownMs: 30000,
      changedAt: new Date().toISOString(),
    };

    return fallback;
  }

  /**
   * Update or override camera detector configuration.
   */
  async updateConfiguration(
    input: {
      tenantId: string;
      branchId: string;
      cameraId: string;
      detectorId: string;
      sensitivity: SensitivityLevel;
      customThreshold?: number;
      overrideReason?: string;
      actor: { userId: string; userName: string };
    },
  ): Promise<CameraDetectorConfiguration> {
    const detector = await this.detectorRepo.getDetector(input.detectorId);
    const model = detector?.currentProductionModelId
      ? await this.detectorRepo.getModelVersion(detector.currentProductionModelId)
      : null;

    const defaultThreshold = model?.defaultThreshold ?? 0.60;
    const threshold =
      input.sensitivity === "CUSTOM" && input.customThreshold
        ? input.customThreshold
        : this.cameraTuningRepo.getThresholdForSensitivity(input.sensitivity, defaultThreshold);

    const config: CameraDetectorConfiguration = {
      id: `tune-${input.cameraId}-${input.detectorId}`,
      tenantId: input.tenantId,
      branchId: input.branchId,
      cameraId: input.cameraId,
      detectorId: input.detectorId,
      modelVersionId: model?.id || "model-default",
      enabled: true,
      sensitivity: input.sensitivity,
      confidenceThreshold: threshold,
      minimumDurationMs: 500,
      cooldownMs: 30000,
      overrideReason: input.overrideReason,
      changedBy: input.actor.userName,
      changedAt: new Date().toISOString(),
    };

    await this.cameraTuningRepo.saveConfiguration(config);

    await this.auditRepo.appendAuditEvent({
      eventType: "CAMERA_THRESHOLD_CHANGED",
      targetId: input.cameraId,
      actor: input.actor,
      details: {
        detectorId: input.detectorId,
        sensitivity: input.sensitivity,
        confidenceThreshold: threshold,
        reason: input.overrideReason,
      },
    });

    return config;
  }

  /**
   * Recommend threshold adjustments for cameras with elevated false alert rates.
   */
  async generateThresholdRecommendation(
    cameraId: string,
    detectorId: string,
    observedFalseAlertRate?: number,
  ): Promise<ThresholdRecommendation> {
    const config = await this.getEffectiveConfiguration("tenant-default", "branch-default", cameraId, detectorId);

    return {
      cameraId,
      detectorId,
      currentThreshold: config.confidenceThreshold,
      observedFalseAlertsPerHour: observedFalseAlertRate !== undefined && Number.isFinite(observedFalseAlertRate) && observedFalseAlertRate >= 0 ? observedFalseAlertRate : null,
      fleetAverageFalseAlertsPerHour: null,
      recommendedThreshold: config.confidenceThreshold,
      expectedFalseAlertsPerHour: null,
      expectedRecallImpactPercent: null,
      recommendationReason: "Threshold recommendation requires measured validation on this camera. Recall impact is not yet known.",
    };
  }

  /**
   * Construct immutable AI provenance for normalized alerts.
   */
  async buildAlertProvenance(
    detectorCode: DetectorCode,
    confidence: number,
    cameraId: string,
    inferenceNodeId = "AI-NODE-PRIMARY",
  ): Promise<AIProvenance> {
    const detector = await this.detectorRepo.getDetectorByCode(detectorCode);
    const model = detector?.currentProductionModelId
      ? await this.detectorRepo.getModelVersion(detector.currentProductionModelId)
      : null;

    const config = detector
      ? await this.cameraTuningRepo.getConfiguration(cameraId, detector.id)
      : null;

    const threshold = config?.confidenceThreshold ?? model?.defaultThreshold ?? 0.60;

    if (!detector || !model || !/^[a-f0-9]{64}$/i.test(model.artifactSha256)) {
      throw new Error("Registered model artifact is required for AI provenance");
    }

    return {
      detectorId: detector.id,
      detectorCode,
      modelId: model.id,
      modelVersion: model.version,
      modelSha256: model.artifactSha256,
      threshold,
      confidence,
      inferenceNodeId,
      hardwareProfile: "unreported",
      inferenceTimestamp: new Date().toISOString(),
    };
  }
}
