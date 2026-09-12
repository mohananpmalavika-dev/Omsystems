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
 */

import { databaseModule } from "./database.module.js";
import { redisModule } from "./redis.module.js";
import { mediaModule } from "./media.module.js";
import { recordingModule } from "./recording.module.js";
import { evidenceModule } from "./evidence.module.js";
import { incidentModule } from "./incident.module.js";
import { analyticsModule } from "./analytics.module.js";
import { identityModule } from "./identity.module.js";
import { moduleRegistry } from "../platform/module-registry.service.js";

export class ApplicationBootstrap {
  async bootstrap(options?: { databaseUrl?: string; redisUrl?: string }): Promise<void> {
    // 1. Critical Infrastructure
    const pool = await databaseModule.initialize(options?.databaseUrl);
    await redisModule.initialize(options?.redisUrl);

    // 2. Core Operational Modules
    await identityModule.initialize(pool);
    await mediaModule.initialize();
    await recordingModule.initialize(pool);
    await evidenceModule.initialize(pool);
    await incidentModule.initialize(pool);
    await analyticsModule.initialize(pool);
  }

  async shutdown(): Promise<void> {
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
