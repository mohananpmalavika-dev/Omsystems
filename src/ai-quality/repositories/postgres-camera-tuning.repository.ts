import type { Pool } from "pg";
import type {
  CameraDetectorConfiguration,
  SensitivityLevel,
} from "../domain/ai-quality.types.js";

export class PostgresCameraTuningRepository {
  private readonly memoryConfigs = new Map<string, CameraDetectorConfiguration>();

  constructor(private readonly pool?: Pool) {
    if (!this.pool && process.env.NODE_ENV === "production") {
      throw new Error("AI_QUALITY_STORE_UNAVAILABLE: PostgresCameraTuningRepository requires a PostgreSQL pool in production");
    }
  }

  async getConfiguration(
    cameraId: string,
    detectorId: string,
  ): Promise<CameraDetectorConfiguration | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT id, tenant_id, branch_id, camera_id, detector_id, model_version_id,
                  is_enabled, sensitivity, confidence_threshold, minimum_duration_ms, updated_at
           FROM ai_camera_assignments
           WHERE camera_id = $1 AND detector_id = $2`,
          [cameraId, detectorId],
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            id: row.id,
            tenantId: row.tenant_id,
            branchId: row.branch_id,
            cameraId: row.camera_id,
            detectorId: row.detector_id,
            modelVersionId: row.model_version_id,
            enabled: row.is_enabled,
            sensitivity: row.sensitivity as SensitivityLevel,
            confidenceThreshold: Number(row.confidence_threshold),
            minimumDurationMs: row.minimum_duration_ms,
            cooldownMs: 30000,
            changedAt: new Date(row.updated_at).toISOString(),
          };
        }
      } catch (err) {
        if (process.env.NODE_ENV === "production") {
          throw new Error(`AI_QUALITY_STORE_UNAVAILABLE: Failed to get camera tuning: ${(err as Error).message}`);
        }
      }
    }
    const key = `${cameraId}:${detectorId}`;
    return this.memoryConfigs.get(key) || null;
  }

  async listConfigurationsForCamera(
    cameraId: string,
  ): Promise<CameraDetectorConfiguration[]> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT id, tenant_id, branch_id, camera_id, detector_id, model_version_id,
                  is_enabled, sensitivity, confidence_threshold, minimum_duration_ms, updated_at
           FROM ai_camera_assignments
           WHERE camera_id = $1`,
          [cameraId],
        );
        return res.rows.map((row) => ({
          id: row.id,
          tenantId: row.tenant_id,
          branchId: row.branch_id,
          cameraId: row.camera_id,
          detectorId: row.detector_id,
          modelVersionId: row.model_version_id,
          enabled: row.is_enabled,
          sensitivity: row.sensitivity as SensitivityLevel,
          confidenceThreshold: Number(row.confidence_threshold),
          minimumDurationMs: row.minimum_duration_ms,
          cooldownMs: 30000,
          changedAt: new Date(row.updated_at).toISOString(),
        }));
      } catch (err) {
        if (process.env.NODE_ENV === "production") {
          throw new Error(`AI_QUALITY_STORE_UNAVAILABLE: ${(err as Error).message}`);
        }
      }
    }
    return Array.from(this.memoryConfigs.values()).filter((c) => c.cameraId === cameraId);
  }

  async saveConfiguration(config: CameraDetectorConfiguration): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO ai_camera_assignments (
             id, tenant_id, branch_id, camera_id, detector_id, model_version_id,
             is_enabled, sensitivity, confidence_threshold, minimum_duration_ms, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
           ON CONFLICT (camera_id, detector_id) DO UPDATE SET
             model_version_id = EXCLUDED.model_version_id,
             is_enabled = EXCLUDED.is_enabled,
             sensitivity = EXCLUDED.sensitivity,
             confidence_threshold = EXCLUDED.confidence_threshold,
             minimum_duration_ms = EXCLUDED.minimum_duration_ms,
             updated_at = NOW()`,
          [
            config.id,
            config.tenantId,
            config.branchId,
            config.cameraId,
            config.detectorId,
            config.modelVersionId,
            config.enabled,
            config.sensitivity,
            config.confidenceThreshold,
            config.minimumDurationMs,
          ],
        );
      } catch (err) {
        if (process.env.NODE_ENV === "production") {
          throw new Error(`AI_QUALITY_STORE_UNAVAILABLE: Failed to save camera tuning: ${(err as Error).message}`);
        }
        console.warn("[PostgresCameraTuningRepo] saveConfiguration DB error:", err);
      }
    }
    const key = `${config.cameraId}:${config.detectorId}`;
    this.memoryConfigs.set(key, config);
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
