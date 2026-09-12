/**
 * Media Domain Module
 * 
 * Manages media gateway registry, stream lease repository, and viewer sessions.
 */

import type { Pool } from "pg";
import { moduleRegistry } from "../platform/module-registry.service.js";
import {
  RedisStreamLeaseRepository,
  RedisMediaGatewayRegistry,
  RedisViewerSessionRepository,
  PostgresCameraCapabilityRepository,
  MediaOrchestrator,
} from "../media/index.js";

export class MediaModule {
  public orchestrator: MediaOrchestrator | null = null;
  public streamLeaseRepo: RedisStreamLeaseRepository | null = null;
  public gatewayRegistry: RedisMediaGatewayRegistry | null = null;
  public sessionRepo: RedisViewerSessionRepository | null = null;
  public capabilityRepo: PostgresCameraCapabilityRepository | null = null;

  async initialize(pool?: Pool, redisClient?: any): Promise<MediaOrchestrator> {
    moduleRegistry.registerModule({
      module: "mediaOrchestration",
      importance: "REQUIRED",
      state: "STARTING",
      reason: "Initializing media plane gateways and stream lease repositories",
    });

    try {
      this.streamLeaseRepo = new RedisStreamLeaseRepository(redisClient);
      this.gatewayRegistry = new RedisMediaGatewayRegistry(redisClient);
      this.sessionRepo = new RedisViewerSessionRepository(redisClient);
      this.capabilityRepo = new PostgresCameraCapabilityRepository(pool);

      this.orchestrator = new MediaOrchestrator(
        this.streamLeaseRepo,
        this.gatewayRegistry,
        this.sessionRepo,
        this.capabilityRepo,
      );

      moduleRegistry.updateModuleState("mediaOrchestration", "READY", "Media orchestration layer initialized");
      return this.orchestrator;
    } catch (err: any) {
      moduleRegistry.updateModuleState("mediaOrchestration", "UNAVAILABLE", err.message);
      if (process.env.NODE_ENV === "production") throw err;
      throw err;
    }
  }

  getOrchestrator(): MediaOrchestrator | null {
    return this.orchestrator;
  }
}

export const mediaModule = new MediaModule();
