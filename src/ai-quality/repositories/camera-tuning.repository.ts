import type {
  CameraDetectorConfiguration,
  SensitivityLevel,
} from "../domain/ai-quality.types.js";

export class CameraTuningRepository {
  private readonly configs = new Map<string, CameraDetectorConfiguration>(); // key: `${cameraId}:${detectorId}`

  constructor() {
  }

  private seedDefaultCameraTunings(): void {
    // Preset: Camera 301-17 (Kochi Branch Vault Camera) tuned for reflection reduction
    const cam301Config: CameraDetectorConfiguration = {
      id: "tune-cam-301-17-intrusion",
      tenantId: "tenant-bank-south",
      branchId: "branch-034",
      cameraId: "cam-301-17",
      detectorId: "det-intrusion",
      modelVersionId: "model-intrusion-v3-2",
      enabled: true,
      sensitivity: "CUSTOM",
      confidenceThreshold: 0.68,
      minimumDurationMs: 500,
      cooldownMs: 30000,
      minimumObjectSizePercent: 2.0,
      overrideReason: "High reflection false positives from metallic vault gate during night lights",
      changedBy: "Security Administrator - Deepa",
      changedAt: "2026-08-14T00:00:00Z",
    };

    this.configs.set(`${cam301Config.cameraId}:${cam301Config.detectorId}`, cam301Config);
  }

  async getConfiguration(
    cameraId: string,
    detectorId: string,
  ): Promise<CameraDetectorConfiguration | null> {
    const key = `${cameraId}:${detectorId}`;
    return this.configs.get(key) || null;
  }

  async listConfigurationsForCamera(
    cameraId: string,
  ): Promise<CameraDetectorConfiguration[]> {
    return Array.from(this.configs.values()).filter((c) => c.cameraId === cameraId);
  }

  async saveConfiguration(config: CameraDetectorConfiguration): Promise<void> {
    const key = `${config.cameraId}:${config.detectorId}`;
    this.configs.set(key, config);
  }

  getThresholdForSensitivity(
    sensitivity: SensitivityLevel,
    defaultThreshold = 0.60,
  ): number {
    switch (sensitivity) {
      case "LOW":
        return 0.75;
      case "MEDIUM":
        return 0.60;
      case "HIGH":
        return 0.45;
      case "CUSTOM":
      default:
        return defaultThreshold;
    }
  }
}
