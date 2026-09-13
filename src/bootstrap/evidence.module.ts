/**
 * Evidence Domain Module
 * 
 * Manages evidence capture pipeline, packaging, and offline verifier integration.
 * Invariant: Never initializes a production pipeline without verified PostgreSQL,
 * recording engine client, evidence storage, and digital signing capabilities.
 */

import type { Pool } from "pg";
import { moduleRegistry } from "../platform/module-registry.service.js";
import {
  EvidenceCapturePipelineService,
  InProcessTestAlertEvidenceClient,
  setAuthoritativeEvidencePipeline,
} from "../evidence/services/evidence-capture-pipeline.service.js";
import { evidencePolicyService } from "../evidence/services/evidence-policy.service.js";
import { evidenceStorageService } from "../evidence/services/evidence-storage.service.js";
import { HttpAlertEvidenceClient } from "../alerts/evidence-capture.js";

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
      const isProduction = process.env.NODE_ENV === "production";
      const recordingUrl = process.env.RECORDING_ENGINE_URL || (isProduction ? undefined : "http://localhost:8088");
      const recordingSharedKey = process.env.RECORDING_ENGINE_SHARED_KEY || (isProduction ? undefined : "kryptovision-recording-secret");

      const recordingClient = recordingUrl && recordingSharedKey
        ? new HttpAlertEvidenceClient(recordingUrl, recordingSharedKey)
        : (isProduction ? undefined : new InProcessTestAlertEvidenceClient());

      this.pipeline = new EvidenceCapturePipelineService(
        evidencePolicyService,
        evidenceStorageService,
        recordingClient,
        pool,
      );
      setAuthoritativeEvidencePipeline(this.pipeline);

      const readiness = await this.pipeline.checkReadiness();
      moduleRegistry.updateModuleState("evidenceService", readiness.state, readiness.reason);
    } catch (err: any) {
      moduleRegistry.updateModuleState("evidenceService", "UNAVAILABLE", err.message);
    }
  }
}

export const evidenceModule = new EvidenceModule();
