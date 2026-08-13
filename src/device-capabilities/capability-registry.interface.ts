/**
 * Device Capability Registry Interface
 * 
 * Central registry for device capabilities with evidence-based verification.
 */

import type {
  Capability,
  CapabilityKey,
  DeviceCapabilitySet,
  EffectiveCapability,
} from "./capability.types.js";

/**
 * Options for capability queries.
 */
export interface CapabilityQueryOptions {
  /** Force refresh from device (default: false) */
  forceRefresh?: boolean;

  /** Include stale evidence (default: false) */
  includeStale?: boolean;

  /** Maximum age of cached data in seconds (default: 300) */
  maxAge?: number;
}

/**
 * Options for capability verification.
 */
export interface CapabilityVerificationOptions {
  /** Timeout for verification in milliseconds */
  timeout?: number;

  /** Skip verification if recently verified */
  skipIfRecent?: boolean;

  /** Minimum age before re-verification in seconds */
  minAgeForReverification?: number;
}

/**
 * Device Capability Registry Service Interface.
 */
export interface DeviceCapabilityRegistry {
  /**
   * Get all capabilities for a device.
   * 
   * Returns cached capabilities unless forceRefresh is true.
   */
  getCapabilities(
    tenantId: string,
    deviceId: string,
    options?: CapabilityQueryOptions,
  ): Promise<DeviceCapabilitySet>;

  /**
   * Get a specific capability for a device.
   * 
   * @throws CapabilityNotFoundError if capability doesn't exist
   */
  getCapability(
    tenantId: string,
    deviceId: string,
    capability: CapabilityKey,
    options?: CapabilityQueryOptions,
  ): Promise<Capability>;

  /**
   * Refresh capabilities by probing the device.
   * 
   * This discovers capabilities from the device and updates the registry.
   */
  refreshCapabilities(
    tenantId: string,
    deviceId: string,
  ): Promise<DeviceCapabilitySet>;

  /**
   * Actively verify a specific capability.
   * 
   * This performs runtime verification (e.g., attempts a PTZ move).
   */
  verifyCapability(
    tenantId: string,
    deviceId: string,
    capability: CapabilityKey,
    options?: CapabilityVerificationOptions,
  ): Promise<Capability>;

  /**
   * Check if a device supports a capability (convenience method).
   * 
   * Returns true if capability is SUPPORTED and available.
   */
  supports(
    tenantId: string,
    deviceId: string,
    capability: CapabilityKey,
    options?: CapabilityQueryOptions,
  ): Promise<boolean>;

  /**
   * Get effective capability (considering dependencies).
   */
  getEffectiveCapability(
    tenantId: string,
    deviceId: string,
    capability: CapabilityKey,
  ): Promise<EffectiveCapability>;

  /**
   * Batch query multiple capabilities.
   */
  getCapabilities(
    tenantId: string,
    deviceId: string,
    capabilities: CapabilityKey[],
    options?: CapabilityQueryOptions,
  ): Promise<Map<CapabilityKey, Capability>>;

  /**
   * Get capability history for a device.
   */
  getCapabilityHistory(
    tenantId: string,
    deviceId: string,
    capability: CapabilityKey,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<CapabilityHistoryEntry[]>;
}

/**
 * Capability history entry.
 */
export interface CapabilityHistoryEntry {
  id: string;
  tenantId: string;
  deviceId: string;
  capability: CapabilityKey;
  previousState: string;
  newState: string;
  previousValue?: string;
  newValue?: string;
  reason?: string;
  changedAt: Date;
  changedBy?: string;
}

/**
 * Error thrown when a capability is not found.
 */
export class CapabilityNotFoundError extends Error {
  constructor(
    public readonly deviceId: string,
    public readonly capability: CapabilityKey,
  ) {
    super(`Capability ${capability} not found for device ${deviceId}`);
    this.name = "CapabilityNotFoundError";
  }
}
