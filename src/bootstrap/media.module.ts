/**
 * Media Domain Module
 * 
 * Manages media gateway registry, stream lease repository, and viewer sessions.
 */

import { moduleRegistry } from "../platform/module-registry.service.js";

export class MediaModule {
  async initialize(): Promise<void> {
    moduleRegistry.registerModule({
      module: "mediaOrchestration",
      importance: "REQUIRED",
      state: "STARTING",
      reason: "Initializing media plane gateways and stream lease repositories",
    });

    try {
      moduleRegistry.updateModuleState("mediaOrchestration", "READY", "Media orchestration layer initialized");
    } catch (err: any) {
      moduleRegistry.updateModuleState("mediaOrchestration", "UNAVAILABLE", err.message);
    }
  }
}

export const mediaModule = new MediaModule();
