/**
 * Capability Repository
 * 
 * Manages persistence of device capabilities and their history.
 */

import type {
  Capability,
  CapabilityKey,
  DeviceCapabilitySet,
  DeviceCapabilityChanged,
} from "../capability.types.js";
import type { CapabilityHistoryEntry } from "../capability-registry.interface.js";

export interface CapabilityRepository {
  /**
   * Get complete capability set for a device.
   */
  getDeviceCapabilities(
    tenantId: string,
    deviceId: string,
  ): Promise<DeviceCapabilitySet | null>;

  /**
   * Get a specific capability.
   */
  getDeviceCapability(
    tenantId: string,
    deviceId: string,
    capability: CapabilityKey,
  ): Promise<Capability | null>;

  /**
   * Save complete capability set.
   */
  saveDeviceCapabilities(capabilities: DeviceCapabilitySet): Promise<void>;

  /**
   * Update a specific capability.
   */
  updateDeviceCapability(
    tenantId: string,
    deviceId: string,
    capability: CapabilityKey,
    value: Capability,
  ): Promise<void>;

  /**
   * Record a capability change in history.
   */
  recordCapabilityChange(change: DeviceCapabilityChanged): Promise<void>;

  /**
   * Get capability history.
   */
  getCapabilityHistory(
    tenantId: string,
    deviceId: string,
    capability: CapabilityKey,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<CapabilityHistoryEntry[]>;

  /**
   * Delete device capabilities.
   */
  deleteDeviceCapabilities(tenantId: string, deviceId: string): Promise<void>;
}

/**
 * In-memory implementation for testing/development.
 */
export class InMemoryCapabilityRepository implements CapabilityRepository {
  private readonly capabilities = new Map<string, DeviceCapabilitySet>();
  private readonly history: CapabilityHistoryEntry[] = [];

  async getDeviceCapabilities(
    tenantId: string,
    deviceId: string,
  ): Promise<DeviceCapabilitySet | null> {
    const key = this.getKey(tenantId, deviceId);
    return this.capabilities.get(key) ?? null;
  }

  async getDeviceCapability(
    tenantId: string,
    deviceId: string,
    capability: CapabilityKey,
  ): Promise<Capability | null> {
    const capSet = await this.getDeviceCapabilities(tenantId, deviceId);
    if (!capSet) return null;

    return this.extractCapability(capSet, capability);
  }

  async saveDeviceCapabilities(capabilities: DeviceCapabilitySet): Promise<void> {
    const key = this.getKey(capabilities.tenantId, capabilities.deviceId);
    this.capabilities.set(key, capabilities);
  }

  async updateDeviceCapability(
    tenantId: string,
    deviceId: string,
    capability: CapabilityKey,
    value: Capability,
  ): Promise<void> {
    const capSet = await this.getDeviceCapabilities(tenantId, deviceId);
    if (!capSet) {
      throw new Error(`No capabilities found for device ${deviceId}`);
    }

    this.setCapability(capSet, capability, value);
    await this.saveDeviceCapabilities(capSet);
  }

  async recordCapabilityChange(change: DeviceCapabilityChanged): Promise<void> {
    this.history.push({
      id: `change-${Date.now()}-${Math.random()}`,
      tenantId: change.tenantId,
      deviceId: change.deviceId,
      capability: change.capability,
      previousState: change.previousState,
      newState: change.newState,
      reason: change.reason,
      changedAt: change.observedAt,
    });
  }

  async getCapabilityHistory(
    tenantId: string,
    deviceId: string,
    capability: CapabilityKey,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<CapabilityHistoryEntry[]> {
    return this.history.filter((entry) => {
      if (entry.tenantId !== tenantId) return false;
      if (entry.deviceId !== deviceId) return false;
      if (entry.capability !== capability) return false;

      if (fromDate && entry.changedAt < fromDate) return false;
      if (toDate && entry.changedAt > toDate) return false;

      return true;
    });
  }

  async deleteDeviceCapabilities(tenantId: string, deviceId: string): Promise<void> {
    const key = this.getKey(tenantId, deviceId);
    this.capabilities.delete(key);

    // Remove from history
    const indices: number[] = [];
    for (let i = 0; i < this.history.length; i++) {
      if (this.history[i].tenantId === tenantId && this.history[i].deviceId === deviceId) {
        indices.push(i);
      }
    }
    for (let i = indices.length - 1; i >= 0; i--) {
      this.history.splice(indices[i], 1);
    }
  }

  // ============ PRIVATE METHODS ============

  private getKey(tenantId: string, deviceId: string): string {
    return `${tenantId}:${deviceId}`;
  }

  private extractCapability(
    capSet: DeviceCapabilitySet,
    capability: CapabilityKey,
  ): Capability | null {
    const parts = capability.split(".");
    let current: any = capSet;

    for (const part of parts) {
      if (!current || typeof current !== "object") {
        return null;
      }
      current = current[part];
    }

    if (current && typeof current === "object" && "state" in current) {
      return current as Capability;
    }

    return null;
  }

  private setCapability(
    capSet: DeviceCapabilitySet,
    capability: CapabilityKey,
    value: Capability,
  ): void {
    const parts = capability.split(".");
    let current: any = capSet;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }

    const lastPart = parts[parts.length - 1];
    current[lastPart] = value;
  }
}
