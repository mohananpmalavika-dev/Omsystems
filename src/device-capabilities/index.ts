/**
 * Device Capability Registry - Public API
 */

// Internal imports for factory function type safety
import type { CapabilityRepository } from "./repositories/capability.repository.js";
import type { CapabilityProbe } from "./capability-probe.interface.js";
import type { DeviceCapabilityRegistry } from "./capability-registry.interface.js";
import { InMemoryCapabilityRepository } from "./repositories/capability.repository.js";
import { CapabilityDiscoveryService } from "./capability-discovery.service.js";
import { CapabilityResolutionService } from "./capability-resolution.service.js";
import { CapabilityRegistryService } from "./capability-registry.service.js";
import { ModelDatabaseProbe } from "./probes/model-database.probe.js";
import { OnvifCapabilityProbe } from "./probes/onvif-capability.probe.js";
import { RtspCapabilityProbe } from "./probes/rtsp-capability.probe.js";

// Types
export type {
  Capability,
  CapabilityState,
  CapabilitySource,
  CapabilityVerificationLevel,
  CapabilityEvidence,
  CapabilityValue,
  CapabilityKey,
  DeviceCapabilitySet,
  EffectiveCapability,
  DeviceCapabilityChanged,
  CapabilityDriftEvent,
  CapabilityDriftType,
  VideoCapabilities,
  RecordingCapabilities,
  AudioCapabilities,
  PtzCapabilities,
  EventCapabilities,
  AnalyticsCapabilities,
  StorageCapabilities,
  NetworkCapabilities,
  SecurityCapabilities,
  ManagementCapabilities,
} from "./capability.types.js";

export {
  CapabilityNotSupportedError,
  CapabilityUnavailableError,
  CapabilityUnknownError,
} from "./capability.types.js";

// Probe interface
export type {
  CapabilityProbe,
  CapabilityProbeContext,
  CapabilityObservation,
  DeviceIdentity,
  ProbeResult,
} from "./capability-probe.interface.js";

export { ProbeError } from "./capability-probe.interface.js";

// Registry interface
export type {
  DeviceCapabilityRegistry,
  CapabilityQueryOptions,
  CapabilityVerificationOptions,
  CapabilityHistoryEntry,
} from "./capability-registry.interface.js";

export { CapabilityNotFoundError } from "./capability-registry.interface.js";

// Services
export { CapabilityRegistryService } from "./capability-registry.service.js";
export { CapabilityDiscoveryService } from "./capability-discovery.service.js";
export { CapabilityResolutionService } from "./capability-resolution.service.js";

// Repository
export type { CapabilityRepository } from "./repositories/capability.repository.js";
export { InMemoryCapabilityRepository } from "./repositories/capability.repository.js";

// Probes
export { OnvifCapabilityProbe } from "./probes/onvif-capability.probe.js";
export { RtspCapabilityProbe } from "./probes/rtsp-capability.probe.js";
export { ModelDatabaseProbe } from "./probes/model-database.probe.js";

// Events
export type {
  CapabilityEvent,
  CapabilityEventType,
  CapabilityEventHandler,
} from "./events/capability-event-bus.js";
export { CapabilityEventBus, capabilityEvents } from "./events/capability-event-bus.js";
export { CapabilityDriftDetector } from "./events/capability-drift-detector.js";

/**
 * Factory function to create a fully configured capability registry.
 */
export function createCapabilityRegistry(options: {
  repository?: CapabilityRepository;
  probes?: CapabilityProbe[];
} = {}): DeviceCapabilityRegistry {
  const {
    repository = new InMemoryCapabilityRepository(),
    probes = [
      new ModelDatabaseProbe(),
      new OnvifCapabilityProbe(),
      new RtspCapabilityProbe(),
    ],
  } = options;

  const discoveryService = new CapabilityDiscoveryService(probes);
  const resolutionService = new CapabilityResolutionService();
  const registryService = new CapabilityRegistryService(
    discoveryService,
    resolutionService,
    repository,
  );

  return registryService;
}
