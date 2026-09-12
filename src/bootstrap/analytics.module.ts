/**
 * Analytics Domain Module
 * 
 * Manages AI quality control plane, detector certification, and suitability.
 */

import type { Pool } from "pg";
import { moduleRegistry } from "../platform/module-registry.service.js";
import { PostgresDetectorRegistryRepository } from "../ai-quality/repositories/postgres-detector-registry.repository.js";
import { PostgresEvaluationRepository } from "../ai-quality/repositories/postgres-evaluation.repository.js";
import { PostgresCameraTuningRepository } from "../ai-quality/repositories/postgres-camera-tuning.repository.js";
import { PostgresAIQualityAuditRepository } from "../ai-quality/repositories/postgres-ai-quality-audit.repository.js";
import { AIQualityPlatformFacade } from "../ai-quality/services/ai-quality-platform.facade.js";

export class AnalyticsModule {
  public detectorRegistry: PostgresDetectorRegistryRepository | null = null;
  public evaluationRepo: PostgresEvaluationRepository | null = null;
  public cameraTuningRepo: PostgresCameraTuningRepository | null = null;
  public auditRepo: PostgresAIQualityAuditRepository | null = null;
  public aiQualityPlatform: AIQualityPlatformFacade | null = null;

  async initialize(pool?: Pool): Promise<AIQualityPlatformFacade | null> {
    moduleRegistry.registerModule({
      module: "aiQuality",
      importance: "REQUIRED",
      state: "STARTING",
      reason: "Initializing AI quality control plane, benchmarks, and certified models",
    });

    try {
      this.detectorRegistry = new PostgresDetectorRegistryRepository(pool);
      this.evaluationRepo = new PostgresEvaluationRepository(pool);
      this.cameraTuningRepo = new PostgresCameraTuningRepository(pool);
      this.auditRepo = new PostgresAIQualityAuditRepository(pool);

      this.aiQualityPlatform = new AIQualityPlatformFacade({
        detectorRepo: this.detectorRegistry,
        evaluationRepo: this.evaluationRepo,
        cameraTuningRepo: this.cameraTuningRepo,
        auditRepo: this.auditRepo,
        pool,
      });

      moduleRegistry.updateModuleState("aiQuality", "READY", "AI quality control plane active");
      return this.aiQualityPlatform;
    } catch (err: any) {
      moduleRegistry.updateModuleState("aiQuality", "UNAVAILABLE", err.message);
      if (process.env.NODE_ENV === "production") throw err;
      return null;
    }
  }

  getPlatform(): AIQualityPlatformFacade | null {
    return this.aiQualityPlatform;
  }
}

export const analyticsModule = new AnalyticsModule();
