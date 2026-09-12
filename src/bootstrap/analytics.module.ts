/**
 * Analytics Domain Module
 * 
 * Manages AI quality control plane, detector certification, and suitability.
 */

import type { Pool } from "pg";
import { moduleRegistry } from "../platform/module-registry.service.js";
import { PostgresDetectorRegistryRepository } from "../ai-quality/repositories/postgres-detector-registry.repository.js";

export class AnalyticsModule {
  public detectorRegistry: PostgresDetectorRegistryRepository | null = null;

  async initialize(pool?: Pool): Promise<void> {
    moduleRegistry.registerModule({
      module: "aiQuality",
      importance: "OPTIONAL",
      state: "STARTING",
      reason: "Initializing AI quality control plane and certified models",
    });

    try {
      this.detectorRegistry = new PostgresDetectorRegistryRepository(pool);
      moduleRegistry.updateModuleState("aiQuality", "READY", "AI quality control plane active");
    } catch (err: any) {
      moduleRegistry.updateModuleState("aiQuality", "DEGRADED", err.message);
    }
  }
}

export const analyticsModule = new AnalyticsModule();
