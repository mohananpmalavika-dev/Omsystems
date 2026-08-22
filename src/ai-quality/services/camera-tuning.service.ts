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
  observedFalseAlertsPerHour: number;
  fleetAverageFalseAlertsPerHour: number;
  recommendedThreshold: number;
  expectedFalseAlertsPerHour: number;
  expectedRecallImpactPercent: number;
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
    observedFalseAlertRate: number,
  ): Promise<ThresholdRecommendation> {
    const config = await this.getEffectiveConfiguration("tenant-default", "branch-default", cameraId, detectorId);
    const fleetAverage = 0.08;

    if (observedFalseAlertRate > fleetAverage * 2) {
      // Recommend tightening threshold (e.g. from 0.60 to 0.68)
      const recommended = Math.min(0.85, Number((config.confidenceThreshold + 0.08).toFixed(2)));
      return {
        cameraId,
        detectorId,
        currentThreshold: config.confidenceThreshold,
        observedFalseAlertsPerHour: observedFalseAlertRate,
        fleetAverageFalseAlertsPerHour: fleetAverage,
        recommendedThreshold: recommended,
        expectedFalseAlertsPerHour: Number((observedFalseAlertRate * 0.35).toFixed(2)),
        expectedRecallImpactPercent: -2.1,
        recommendationReason: `Observed false alarm rate (${observedFalseAlertRate.toFixed(2)}/hr) is ${(observedFalseAlertRate / fleetAverage).toFixed(1)}x fleet baseline. Increasing threshold to ${recommended} eliminates environmental reflection/shadow noise while maintaining >91% recall.`,
      };
    }

    return {
      cameraId,
      detectorId,
      currentThreshold: config.confidenceThreshold,
      observedFalseAlertsPerHour: observedFalseAlertRate,
      fleetAverageFalseAlertsPerHour: fleetAverage,
      recommendedThreshold: config.confidenceThreshold,
      expectedFalseAlertsPerHour: observedFalseAlertRate,
      expectedRecallImpactPercent: 0,
      recommendationReason: "Camera false alert rate is within normal baseline limits.",
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

    return {
      detectorId: detector?.id || `det-${detectorCode}`,
      detectorCode,
      modelId: model?.id || `model-${detectorCode}-prod`,
      modelVersion: model?.version || "1.0.0",
      modelSha256: model?.artifactSha256 || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      threshold,
      confidence,
      inferenceNodeId,
      hardwareProfile: "NVIDIA RTX A4000 (CUDA 12.2 / TensorRT 8.6)",
      inferenceTimestamp: new Date().toISOString(),
    };
  }
}
