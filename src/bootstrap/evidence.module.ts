/**
 * Evidence Domain Module
 * 
 * Manages evidence capture pipeline, packaging, and offline verifier integration.
 */

import type { Pool } from "pg";
import { moduleRegistry } from "../platform/module-registry.service.js";
import {
  EvidenceCapturePipelineService,
  setAuthoritativeEvidencePipeline,
} from "../evidence/services/evidence-capture-pipeline.service.js";

export class EvidenceModule {
  public pipeline: EvidenceCapturePipelineService | null = null;

  async initialize(pool?: Pool): Promise<void> {
    moduleRegistry.registerModule({
      module: "evidenceService",
      importance: "REQUIRED",
      state: "STARTING",
      reason: "Initializing 8-stage forensic evidence pipeline",
    });

    try {
      this.pipeline = new EvidenceCapturePipelineService(undefined, undefined, undefined, pool);
      setAuthoritativeEvidencePipeline(this.pipeline);
      moduleRegistry.updateModuleState("evidenceService", "READY", "Evidence capture pipeline active");
    } catch (err: any) {
      moduleRegistry.updateModuleState("evidenceService", "UNAVAILABLE", err.message);
    }
  }
}

export const evidenceModule = new EvidenceModule();
