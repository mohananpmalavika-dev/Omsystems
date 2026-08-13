/**
 * Device Capability Registry Service Implementation
 */

import type {
  Capability,
  CapabilityKey,
  DeviceCapabilitySet,
  EffectiveCapability,
} from "./capability.types.js";
import type {
  CapabilityQueryOptions,
  CapabilityVerificationOptions,
  DeviceCapabilityRegistry,
  CapabilityHistoryEntry,
} from "./capability-registry.interface.js";
import { CapabilityNotFoundError } from "./capability-registry.interface.js";
import type { CapabilityDiscoveryService } from "./capability-discovery.service.js";
import type { CapabilityRepository } from "./repositories/capability.repository.js";
import type { CapabilityResolutionService } from "./capability-resolution.service.js";
import { EventEmitter } from "node:events";
import type { DeviceCapabilityChanged } from "./capability.types.js";
import { capabilityEvents } from "./events/capability-event-bus.js";
import { CapabilityDriftDetector } from "./events/capability-drift-detector.js";

/**
 * Default cache TTL in seconds.
 */
const DEFAULT_CACHE_TTL = 300; // 5 minutes

/**
 * Default minimum age before re-verification in seconds.
 */
const DEFAULT_REVERIFICATION_AGE = 60; // 1 minute

export class CapabilityRegistryService implements DeviceCapabilityRegistry {
  private readonly events = new EventEmitter();
  private readonly cache = new Map<string, CachedCapabilitySet>();
  private readonly driftDetector: CapabilityDriftDetector;

  constructor(
    private readonly discoveryService: CapabilityDiscoveryService,
    private readonly resolutionService: CapabilityResolutionService,
    private readonly repository: CapabilityRepository,
  ) {
    this.driftDetector = new CapabilityDriftDetector(capabilityEvents);
  }

  /**
   * Get all capabilities for a device.
   */
  async getCapabilities(
    tenantId: string,
    deviceId: string,
    options: CapabilityQueryOptions = {},
  ): Promise<DeviceCapabilitySet> {
    const cacheKey = this.getCacheKey(tenantId, deviceId);
    const maxAge = options.maxAge ?? DEFAULT_CACHE_TTL;

    // Check cache unless force refresh
    if (!options.forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && !this.isCacheStale(cached, maxAge)) {
        return cached.capabilities;
      }
    }

    // Load from database
    const stored = await this.repository.getDeviceCapabilities(tenantId, deviceId);

    if (stored && !options.forceRefresh) {
      // Check if stored data is fresh enough
      const age = Date.now() - stored.lastUpdatedAt.getTime();
      if (age / 1000 < maxAge) {
        this.updateCache(tenantId, deviceId, stored);
        return stored;
      }
    }

    // Refresh from device if no stored data or force refresh
    if (!stored || options.forceRefresh) {
      return this.refreshCapabilities(tenantId, deviceId);
    }

    return stored;
  }

  /**
   * Get a specific capability.
   */
  async getCapability(
    tenantId: string,
    deviceId: string,
    capability: CapabilityKey,
    options: CapabilityQueryOptions = {},
  ): Promise<Capability> {
    const capabilities = await this.getCapabilities(tenantId, deviceId, options);
    const cap = this.extractCapability(capabilities, capability);

    if (!cap) {
      throw new CapabilityNotFoundError(deviceId, capability);
    }

    return cap;
  }

  /**
   * Refresh capabilities by probing the device.
   */
  async refreshCapabilities(
    tenantId: string,
    deviceId: string,
  ): Promise<DeviceCapabilitySet> {
    // Get device identity
    const device = await this.getDeviceIdentity(tenantId, deviceId);

    // Discover capabilities from all applicable probes
    const observations = await this.discoveryService.discover(device);

    // Resolve observations into capabilities
    const capabilities = await this.resolutionService.resolve(
      tenantId,
      deviceId,
      observations,
    );

    // Detect changes and emit events
    const previous = await this.repository.getDeviceCapabilities(tenantId, deviceId);
    if (previous) {
      await this.detectAndEmitChanges(previous, capabilities);
    }

    // Store in database
    await this.repository.saveDeviceCapabilities(capabilities);

    // Update cache
    this.updateCache(tenantId, deviceId, capabilities);

    return capabilities;
  }

  /**
   * Verify a specific capability.
   */
  async verifyCapability(
    tenantId: string,
    deviceId: string,
    capability: CapabilityKey,
    options: CapabilityVerificationOptions = {},
  ): Promise<Capability> {
    const device = await this.getDeviceIdentity(tenantId, deviceId);

    // Check if recently verified
    if (options.skipIfRecent) {
      const current = await this.repository.getDeviceCapability(
        tenantId,
        deviceId,
        capability,
      );

      if (current?.verifiedAt) {
        const age = Date.now() - current.verifiedAt.getTime();
        const minAge = (options.minAgeForReverification ?? DEFAULT_REVERIFICATION_AGE) * 1000;
        if (age < minAge) {
          return current;
        }
      }
    }

    // Perform verification
    const observation = await this.discoveryService.verify(device, capability, {
      timeout: options.timeout,
    });

    if (!observation) {
      throw new Error(`Unable to verify capability ${capability} for device ${deviceId}`);
    }

    // Resolve observation into capability
    const capabilities = await this.resolutionService.resolve(tenantId, deviceId, [observation]);

    // Extract verified capability
    const verified = this.extractCapability(capabilities, capability);
    if (!verified) {
      throw new CapabilityNotFoundError(deviceId, capability);
    }

    // Update in database
    await this.repository.updateDeviceCapability(tenantId, deviceId, capability, verified);

    // Invalidate cache
    this.invalidateCache(tenantId, deviceId);

    return verified;
  }

  /**
   * Check if device supports a capability.
   */
  async supports(
    tenantId: string,
    deviceId: string,
    capability: CapabilityKey,
    options: CapabilityQueryOptions = {},
  ): Promise<boolean> {
    try {
      const cap = await this.getCapability(tenantId, deviceId, capability, options);
      return cap.state === "SUPPORTED" && cap.available;
    } catch (error) {
      if (error instanceof CapabilityNotFoundError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get effective capability considering dependencies.
   */
  async getEffectiveCapability(
    tenantId: string,
    deviceId: string,
    capability: CapabilityKey,
  ): Promise<EffectiveCapability> {
    const cap = await this.getCapability(tenantId, deviceId, capability);

    // For now, return device capability as effective
    // This will be enhanced when integrated with Digital Twin
    return {
      deviceSupport: cap.state,
      platformSupport: "SUPPORTED", // TODO: Check adapter implementation
      effectiveState: cap.state,
      effectivelyAvailable: cap.available,
      dependencies: [],
    };
  }

  /**
   * Get capability history.
   */
  async getCapabilityHistory(
    tenantId: string,
    deviceId: string,
    capability: CapabilityKey,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<CapabilityHistoryEntry[]> {
    return this.repository.getCapabilityHistory(
      tenantId,
      deviceId,
      capability,
      fromDate,
      toDate,
    );
  }

  /**
   * Subscribe to capability change events.
   */
  onCapabilityChanged(
    callback: (event: DeviceCapabilityChanged) => void,
  ): () => void {
    this.events.on("capability-changed", callback);
    return () => this.events.off("capability-changed", callback);
  }

  // ============ PRIVATE METHODS ============

  private getCacheKey(tenantId: string, deviceId: string): string {
    return `${tenantId}:${deviceId}`;
  }

  private updateCache(
    tenantId: string,
    deviceId: string,
    capabilities: DeviceCapabilitySet,
  ): void {
    const cacheKey = this.getCacheKey(tenantId, deviceId);
    this.cache.set(cacheKey, {
      capabilities,
      cachedAt: Date.now(),
    });
  }

  private invalidateCache(tenantId: string, deviceId: string): void {
    const cacheKey = this.getCacheKey(tenantId, deviceId);
    this.cache.delete(cacheKey);
  }

  private isCacheStale(cached: CachedCapabilitySet, maxAgeSeconds: number): boolean {
    const age = Date.now() - cached.cachedAt;
    return age / 1000 > maxAgeSeconds;
  }

  private extractCapability(
    capabilities: DeviceCapabilitySet,
    key: CapabilityKey,
  ): Capability | undefined {
    const parts = key.split(".");
    let current: any = capabilities;

    for (const part of parts) {
      if (!current || typeof current !== "object") {
        return undefined;
      }
      current = current[part];
    }

    // Ensure it's a Capability object
    if (current && typeof current === "object" && "state" in current) {
      return current as Capability;
    }

    return undefined;
  }

  private async detectAndEmitChanges(
    previous: DeviceCapabilitySet,
    current: DeviceCapabilitySet,
  ): Promise<void> {
    // Compare all capability paths and emit changes
    const changes = this.findCapabilityChanges(previous, current);

    for (const change of changes) {
      this.events.emit("capability-changed", change);
      await this.repository.recordCapabilityChange(change);
      await capabilityEvents.publishCapabilityChanged(change);
    }

    // Detect drift patterns
    await this.driftDetector.detectDrift(previous, current);
  }

  private findCapabilityChanges(
    previous: DeviceCapabilitySet,
    current: DeviceCapabilitySet,
  ): DeviceCapabilityChanged[] {
    const changes: DeviceCapabilityChanged[] = [];

    // Helper to compare capabilities recursively
    const compare = (
      prevObj: any,
      currObj: any,
      path: string[] = [],
    ): void => {
      if (!prevObj || !currObj) return;

      for (const key of Object.keys(currObj)) {
        const prevValue = prevObj[key];
        const currValue = currObj[key];

        if (
          currValue &&
          typeof currValue === "object" &&
          "state" in currValue &&
          "available" in currValue
        ) {
          // This is a Capability object
          const capability = prevValue as Capability | undefined;
          const newCapability = currValue as Capability;

          if (
            !capability ||
            capability.state !== newCapability.state ||
            capability.available !== newCapability.available
          ) {
            const capabilityKey = [...path, key].join(".") as CapabilityKey;
            changes.push({
              tenantId: current.tenantId,
              deviceId: current.deviceId,
              capability: capabilityKey,
              previousState: capability?.state ?? "UNKNOWN",
              newState: newCapability.state,
              previousAvailable: capability?.available ?? false,
              newAvailable: newCapability.available,
              evidence: newCapability.evidence,
              observedAt: new Date(),
            });
          }
        } else if (currValue && typeof currValue === "object") {
          // Recurse into nested objects
          compare(prevValue, currValue, [...path, key]);
        }
      }
    };

    compare(previous, current);
    return changes;
  }

  private async getDeviceIdentity(
    tenantId: string,
    deviceId: string,
  ): Promise<any> {
    // TODO: Implement device identity lookup
    // For now, return minimal identity
    return {
      deviceId,
      tenantId,
    };
  }
}

interface CachedCapabilitySet {
  capabilities: DeviceCapabilitySet;
  cachedAt: number;
}
