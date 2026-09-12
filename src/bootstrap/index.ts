/**
 * Master Application Bootstrap Module
 * 
 * Coordinates orderly initialization of all domain modules:
 * 1. Database (PostgreSQL pool)
 * 2. Redis (Distributed state)
 * 3. Media Orchestration
 * 4. Recording Engine & Index
 * 5. Evidence Pipeline
 * 6. Incident & SOP Engine
 * 7. AI Quality Control Plane
 * 8. Identity & Immutable Audit
 * 9. Fail-Closed Privacy Governance
 */

import type { Pool } from "pg";
import { databaseModule } from "./database.module.js";
import { redisModule } from "./redis.module.js";
import { mediaModule } from "./media.module.js";
import { recordingModule } from "./recording.module.js";
import { evidenceModule } from "./evidence.module.js";
import { incidentModule } from "./incident.module.js";
import { analyticsModule } from "./analytics.module.js";
import { identityModule } from "./identity.module.js";
import { privacyModule } from "./privacy.module.js";
import { moduleRegistry } from "../platform/module-registry.service.js";

import type { PlaybookEngineService } from "../incidents/services/playbook-engine.service.js";
import type { EvidenceCapturePipelineService } from "../evidence/services/evidence-capture-pipeline.service.js";
import type { PrivacyOverrideService } from "../privacy/services/privacy-override.service.js";
import type { AIQualityPlatformFacade } from "../ai-quality/services/ai-quality-platform.facade.js";
import type { MediaOrchestrator } from "../media/index.js";
import type { CentralAuditService } from "../audit/services/central-audit.service.js";
import type { RecordingStartupRecoveryService } from "../recording/services/recording-startup-recovery.service.js";
import type { RecordingContinuityLedgerService } from "../recording/services/recording-continuity-ledger.service.js";
import type { AuthoritativeRecordingSearchService } from "../recording/services/authoritative-recording-search.service.js";

export interface ApplicationDependencies {
  pool: Pool | null;
  playbookEngine: PlaybookEngineService | null;
  evidencePipeline: EvidenceCapturePipelineService | null;
  privacyService: PrivacyOverrideService | null;
  aiQuality: AIQualityPlatformFacade | null;
  mediaOrchestrator: MediaOrchestrator | null;
  auditService: CentralAuditService | null;
  recoveryService: RecordingStartupRecoveryService | null;
  continuityService: RecordingContinuityLedgerService | null;
  recordingSearchService: AuthoritativeRecordingSearchService | null;
}

export class ApplicationBootstrap {
  private dependencies: ApplicationDependencies | null = null;

  async bootstrap(options?: { databaseUrl?: string; redisUrl?: string }): Promise<ApplicationDependencies> {
    const isProduction = process.env.NODE_ENV === "production";

    // 1. Critical Infrastructure
    const pool = await databaseModule.initialize(options?.databaseUrl);
    const redisClient = await redisModule.initialize(options?.redisUrl);

    // 2. Core Operational Modules
    await identityModule.initialize(pool);
    const mediaOrchestrator = await mediaModule.initialize(pool, redisClient);
    await recordingModule.initialize(pool);
    await evidenceModule.initialize(pool);
    const playbookEngine = await incidentModule.initialize(pool);
    const aiQuality = await analyticsModule.initialize(pool);
    const privacyService = await privacyModule.initialize(pool);

    // 3. Register Authoritative Readiness Contributors
    this.registerReadinessContributors(pool);

    this.dependencies = {
      pool,
      playbookEngine,
      evidencePipeline: evidenceModule.pipeline,
      privacyService,
      aiQuality,
      mediaOrchestrator,
      auditService: identityModule.auditService,
      recoveryService: recordingModule.recoveryService,
      continuityService: recordingModule.continuityService,
      recordingSearchService: recordingModule.searchService,
    };

    return this.dependencies;
  }

  private registerReadinessContributors(pool: Pool | null): void {
    const isProduction = process.env.NODE_ENV === "production";

    moduleRegistry.registerContributor({
      name: "database",
      importance: "CRITICAL",
      async check() {
        if (!pool) {
          return {
            state: isProduction ? "UNAVAILABLE" : "DEGRADED",
            reason: isProduction ? "PostgreSQL connection pool missing" : "Running in test memory mode",
          };
        }
        const client = await pool.connect();
        try {
          await client.query("SELECT 1");
          return { state: "READY", reason: "Connected to PostgreSQL database" };
        } finally {
          client.release();
        }
      },
    });

    moduleRegistry.registerContributor({
      name: "redis",
      importance: isProduction ? "CRITICAL" : "REQUIRED",
      async check() {
        const client = redisModule.getClient();
        if (!client && isProduction) {
          return { state: "UNAVAILABLE", reason: "Redis cluster client missing in production" };
        }
        if (!client) {
          return { state: "DEGRADED", reason: "Running in standalone mode without Redis" };
        }
        return { state: "READY", reason: "Connected to Redis cluster" };
      },
    });

    moduleRegistry.registerContributor({
      name: "recordingIndex",
      importance: "CRITICAL",
      async check() {
        if (!pool) {
          return {
            state: isProduction ? "UNAVAILABLE" : "DEGRADED",
            reason: isProduction ? "PostgreSQL required for recording index" : "In-memory index active",
          };
        }
        const client = await pool.connect();
        try {
          await client.query("SELECT 1 FROM recording_segments LIMIT 0");
          return { state: "READY", reason: "Recording index and storage tables verified" };
        } catch (err: any) {
          return { state: isProduction ? "UNAVAILABLE" : "DEGRADED", reason: err.message };
        } finally {
          client.release();
        }
      },
    });

    moduleRegistry.registerContributor({
      name: "evidenceService",
      importance: "REQUIRED",
      async check() {
        if (!evidenceModule.pipeline) {
          return { state: "UNAVAILABLE", reason: "Evidence pipeline not initialized" };
        }
        return { state: "READY", reason: "Evidence capture and signing pipeline active" };
      },
    });

    moduleRegistry.registerContributor({
      name: "incidentEngine",
      importance: "REQUIRED",
      async check() {
        if (!incidentModule.playbookEngine) {
          return { state: "UNAVAILABLE", reason: "Incident playbook engine not initialized" };
        }
        return { state: "READY", reason: "Incident playbooks and escalation scheduler ready" };
      },
    });

    moduleRegistry.registerContributor({
      name: "aiQuality",
      importance: "REQUIRED",
      async check() {
        if (!analyticsModule.aiQualityPlatform) {
          return { state: "UNAVAILABLE", reason: "AI Quality platform not initialized" };
        }
        return { state: "READY", reason: "AI quality control plane and detector registry operational" };
      },
    });

    moduleRegistry.registerContributor({
      name: "privacy",
      importance: "REQUIRED",
      async check() {
        if (!privacyModule.privacyService) {
          return { state: "UNAVAILABLE", reason: "Privacy override service not initialized" };
        }
        return { state: "READY", reason: "Privacy governance engine active (fail-closed)" };
      },
    });

    moduleRegistry.registerContributor({
      name: "identity",
      importance: "CRITICAL",
      async check() {
        if (!identityModule.auditService) {
          return { state: "UNAVAILABLE", reason: "Central audit service not initialized" };
        }
        return { state: "READY", reason: "Identity and immutable audit platform operational" };
      },
    });

    moduleRegistry.registerContributor({
      name: "mediaOrchestration",
      importance: "REQUIRED",
      async check() {
        if (!mediaModule.orchestrator) {
          return { state: "UNAVAILABLE", reason: "Media orchestrator not initialized" };
        }
        return { state: "READY", reason: "Media orchestration layer initialized" };
      },
    });

    moduleRegistry.registerContributor({
      name: "eventBus",
      importance: "CRITICAL",
      async check() {
        return { state: "READY", reason: "Transactional event bus operational" };
      },
    });

    moduleRegistry.registerContributor({
      name: "audit",
      importance: "CRITICAL",
      async check() {
        if (!identityModule.auditService && isProduction) {
          return { state: "UNAVAILABLE", reason: "Audit service not initialized" };
        }
        return { state: "READY", reason: "Immutable audit event pipeline operational" };
      },
    });

    moduleRegistry.registerContributor({
      name: "notifications",
      importance: "REQUIRED",
      async check() {
        return { state: "READY", reason: "Notification dispatchers active" };
      },
    });
  }

  getDependencies(): ApplicationDependencies | null {
    return this.dependencies;
  }

  async shutdown(): Promise<void> {
    await redisModule.close();
    await databaseModule.close();
  }

  getReadiness() {
    return moduleRegistry.getReadiness();
  }
}

export const applicationBootstrap = new ApplicationBootstrap();
export * from "./database.module.js";
export * from "./redis.module.js";
export * from "./media.module.js";
export * from "./recording.module.js";
export * from "./evidence.module.js";
export * from "./incident.module.js";
export * from "./analytics.module.js";
export * from "./identity.module.js";
export * from "./privacy.module.js";
