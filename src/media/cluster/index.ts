/**
 * High Availability (HA) & Distributed Camera Ownership Subsystem
 * Exports singleton instances and helper factories
 */

import { CameraLeaseService } from "./camera-lease.service.js";
import { mediaNodeRegistry } from "./media-node-registry.js";
import { MediaPlacementService } from "./media-placement.service.js";
import { CameraSupervisorService } from "./camera-supervisor.service.js";
import { fencingTokenService } from "./fencing-token.service.js";
import { HaFailoverCoordinator } from "./failover-coordinator.js";

export * from "./camera-lease.types.js";
export * from "./camera-lease.service.js";
export * from "./media-node-registry.js";
export * from "./media-placement.service.js";
export * from "./camera-supervisor.service.js";
export * from "./fencing-token.service.js";
export * from "./failover-coordinator.js";

export const cameraLeaseService = new CameraLeaseService();
export const mediaPlacementService = new MediaPlacementService(mediaNodeRegistry);
export const cameraSupervisorService = new CameraSupervisorService(cameraLeaseService);
export const haFailoverCoordinator = new HaFailoverCoordinator(
  cameraLeaseService,
  mediaNodeRegistry,
  mediaPlacementService,
  cameraSupervisorService,
  fencingTokenService,
);
