/**
 * Capabilities Module
 * Exposes system capability tiers and status tracking
 */

export {
  CapabilityRegistry,
  CapabilityTier,
  CapabilityStatus,
  getCapabilityRegistry,
  resetCapabilityRegistry,
  type CapabilityDefinition,
  type CapabilityCheck,
} from './capability-registry';

export {
  SYSTEM_CAPABILITIES,
  initializeCapabilities,
  getCapabilitiesByTier,
  getCapabilitiesByCategory,
  getCapabilityStats,
} from './capability-definitions';
