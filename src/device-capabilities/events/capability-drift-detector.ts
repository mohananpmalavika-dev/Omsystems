/**
 * Capability Drift Detector
 *
 * Monitors capability changes and detects meaningful drift patterns.
 */

import type {
  DeviceCapabilityChanged,
  CapabilityDriftEvent,
  CapabilityDriftType,
  DeviceCapabilitySet,
  Capability,
  CapabilityKey,
} from "../capability.types.js";
import type { CapabilityEventBus } from "./capability-event-bus.js";

/**
 * Drift detection thresholds.
 */
export interface DriftDetectionConfig {
  minConfidenceDrop: number;
  comparisonWindowSeconds: number;
  detectFirmwareDrift: boolean;
  detectLicenseDrift: boolean;
}

const DEFAULT_CONFIG: DriftDetectionConfig = {
  minConfidenceDrop: 0.2,
  comparisonWindowSeconds: 3600,
  detectFirmwareDrift: true,
  detectLicenseDrift: true,
};

export class CapabilityDriftDetector {
  private readonly config: DriftDetectionConfig;
  private readonly previousCapabilities = new Map<string, DeviceCapabilitySet>();

  constructor(
    private readonly eventBus: CapabilityEventBus,
    config?: Partial<DriftDetectionConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async detectDrift(
    previous: DeviceCapabilitySet,
    current: DeviceCapabilitySet,
  ): Promise<CapabilityDriftEvent[]> {
    const driftEvents: CapabilityDriftEvent[] = [];

    // Store previous for future comparisons
    this.previousCapabilities.set(
      this.getKey(current.tenantId, current.deviceId),
      previous,
    );

    // Compare each capability domain and include tenant/device context
    driftEvents.push(...this.compareCapabilities(previous.video, current.video, "video", current.tenantId, current.deviceId));
    driftEvents.push(...this.compareCapabilities(previous.recording, current.recording, "recording", current.tenantId, current.deviceId));
    driftEvents.push(...this.compareCapabilities(previous.ptz, current.ptz, "ptz", current.tenantId, current.deviceId));
    driftEvents.push(...this.compareCapabilities(previous.audio, current.audio, "audio", current.tenantId, current.deviceId));
    driftEvents.push(...this.compareCapabilities(previous.events, current.events, "events", current.tenantId, current.deviceId));
    driftEvents.push(...this.compareCapabilities(previous.analytics, current.analytics, "analytics", current.tenantId, current.deviceId));
    driftEvents.push(...this.compareCapabilities(previous.storage, current.storage, "storage", current.tenantId, current.deviceId));
    driftEvents.push(...this.compareCapabilities(previous.network, current.network, "network", current.tenantId, current.deviceId));
    driftEvents.push(...this.compareCapabilities(previous.security, current.security, "security", current.tenantId, current.deviceId));
    driftEvents.push(...this.compareCapabilities(previous.management, current.management, "management", current.tenantId, current.deviceId));

    // Enrich events and publish them
    for (const event of driftEvents) {
      event.probableCause = this.inferCause(event, previous, current);
      await this.eventBus.publishCapabilityDrift(event);
    }

    return driftEvents;
  }

  private compareCapabilities(
    previous: any,
    current: any,
    prefix: string,
    tenantId: string,
    deviceId: string,
  ): CapabilityDriftEvent[] {
    const events: CapabilityDriftEvent[] = [];

    if (!previous && !current) return events;

    // Capability added
    if (!previous && current) {
      const capabilities = this.extractCapabilities(current, prefix);
      for (const cap of capabilities) {
        if (cap.capability.state === "SUPPORTED") {
          events.push({
            driftType: "CAPABILITY_ADDED",
            capability: cap.path as CapabilityKey,
            newValue: cap.capability.state,
            tenantId,
            deviceId,
            detectedAt: new Date(),
          });
        }
      }
      return events;
    }

    // Capability removed
    if (previous && !current) {
      const capabilities = this.extractCapabilities(previous, prefix);
      for (const cap of capabilities) {
        if (cap.capability.state === "SUPPORTED") {
          events.push({
            driftType: "CAPABILITY_REMOVED",
            capability: cap.path as CapabilityKey,
            previousValue: cap.capability.state,
            tenantId,
            deviceId,
            detectedAt: new Date(),
          });
        }
      }
      return events;
    }

    // Compare nested capabilities
    for (const key of Object.keys({ ...(previous || {}), ...(current || {}) })) {
      const prevValue = previous?.[key];
      const currValue = current?.[key];

      if (this.isCapability(currValue)) {
        const prevCap = prevValue as Capability | undefined;
        const currCap = currValue as Capability;
        const capPath = `${prefix}.${key}`;

        // State changes
        if (prevCap?.state !== currCap.state) {
          events.push(...this.detectStateChange(capPath, prevCap, currCap, tenantId, deviceId));
        }

        // Availability changes
        if (prevCap && prevCap.available !== currCap.available) {
          if (!currCap.available && prevCap.available) {
            events.push({
              driftType: "CAPABILITY_UNAVAILABLE",
              capability: capPath as CapabilityKey,
              previousValue: "available",
              newValue: "unavailable",
              tenantId,
              deviceId,
              detectedAt: new Date(),
            });
          } else if (currCap.available && !prevCap.available) {
            events.push({
              driftType: "CAPABILITY_RECOVERED",
              capability: capPath as CapabilityKey,
              previousValue: "unavailable",
              newValue: "available",
              tenantId,
              deviceId,
              detectedAt: new Date(),
            });
          }
        }

        // Confidence drops
        if (
          prevCap &&
          typeof currCap.confidence === "number" &&
          typeof prevCap.confidence === "number" &&
          currCap.confidence < prevCap.confidence - this.config.minConfidenceDrop
        ) {
          events.push({
            driftType: "CAPABILITY_DEGRADED",
            capability: capPath as CapabilityKey,
            previousValue: prevCap.confidence.toFixed(2),
            newValue: currCap.confidence.toFixed(2),
            tenantId,
            deviceId,
            detectedAt: new Date(),
          });
        }
      } else if (typeof currValue === "object" && currValue !== null) {
        events.push(...this.compareCapabilities(prevValue, currValue, `${prefix}.${key}`, tenantId, deviceId));
      }
    }

    return events;
  }

  private detectStateChange(
    path: string,
    previous: Capability | undefined,
    current: Capability,
    tenantId: string,
    deviceId: string,
  ): CapabilityDriftEvent[] {
    const events: CapabilityDriftEvent[] = [];

    if (!previous) {
      if (current.state === "SUPPORTED") {
        events.push({
          driftType: "CAPABILITY_ADDED",
          capability: path as CapabilityKey,
          newValue: current.state,
          tenantId,
          deviceId,
          detectedAt: new Date(),
        });
      }
      return events;
    }

    if (previous.state === "SUPPORTED" && current.state !== "SUPPORTED") {
      if (current.state === "UNAVAILABLE") {
        events.push({
          driftType: "CAPABILITY_UNAVAILABLE",
          capability: path as CapabilityKey,
          previousValue: previous.state,
          newValue: current.state,
          tenantId,
          deviceId,
          detectedAt: new Date(),
        });
      } else if (current.state === "DEGRADED") {
        events.push({
          driftType: "CAPABILITY_DEGRADED",
          capability: path as CapabilityKey,
          previousValue: previous.state,
          newValue: current.state,
          tenantId,
          deviceId,
          detectedAt: new Date(),
        });
      } else if (current.state === "UNSUPPORTED") {
        events.push({
          driftType: "CAPABILITY_REMOVED",
          capability: path as CapabilityKey,
          previousValue: previous.state,
          newValue: current.state,
          tenantId,
          deviceId,
          detectedAt: new Date(),
        });
      }
    } else if (previous.state !== "SUPPORTED" && current.state === "SUPPORTED") {
      events.push({
        driftType: "CAPABILITY_RECOVERED",
        capability: path as CapabilityKey,
        previousValue: previous.state,
        newValue: current.state,
        tenantId,
        deviceId,
        detectedAt: new Date(),
      });
    } else if (previous.state !== current.state) {
      events.push({
        driftType: "CAPABILITY_CONFIGURATION_CHANGED",
        capability: path as CapabilityKey,
        previousValue: previous.state,
        newValue: current.state,
        tenantId,
        deviceId,
        detectedAt: new Date(),
      });
    }

    return events;
  }

  private inferCause(
    event: CapabilityDriftEvent,
    previous: DeviceCapabilitySet,
    current: DeviceCapabilitySet,
  ): string | undefined {
    if (this.config.detectFirmwareDrift) {
      const prevFirmware = previous.management?.firmwareVersion;
      const currFirmware = current.management?.firmwareVersion;

      if (
        prevFirmware?.attributes?.value !== currFirmware?.attributes?.value &&
        currFirmware?.attributes?.value
      ) {
        return `Firmware upgrade to ${currFirmware.attributes.value}`;
      }
    }

    if (
      event.driftType === "CAPABILITY_UNAVAILABLE" &&
      event.capability.includes("network")
    ) {
      return "Possible credential expiry or network authentication failure";
    }

    if (event.capability.includes("security")) {
      if (event.driftType === "CAPABILITY_REMOVED" || event.driftType === "CAPABILITY_UNAVAILABLE") {
        return "Security configuration change or certificate expiry";
      }
    }

    if (event.capability.includes("storage")) {
      if (event.driftType === "CAPABILITY_UNAVAILABLE") {
        return "Storage device removed or failed";
      }
    }

    const typeInferences: Record<CapabilityDriftType, string> = {
      CAPABILITY_ADDED: "Device reconfiguration or firmware upgrade",
      CAPABILITY_REMOVED: "Configuration change or hardware limitation",
      CAPABILITY_UNAVAILABLE: "Temporary service interruption or configuration issue",
      CAPABILITY_RECOVERED: "Service restored or configuration fixed",
      CAPABILITY_DEGRADED: "Partial service failure or resource constraint",
      CAPABILITY_CONFIGURATION_CHANGED: "Device reconfiguration",
    };

    return typeInferences[event.driftType];
  }

  private isCapability(obj: any): obj is Capability {
    return (
      obj &&
      typeof obj === "object" &&
      "state" in obj &&
      "available" in obj
    );
  }

  private extractCapabilities(
    obj: any,
    prefix: string,
  ): Array<{ path: string; capability: Capability }> {
    const result: Array<{ path: string; capability: Capability }> = [];

    for (const [key, value] of Object.entries(obj || {})) {
      if (this.isCapability(value)) {
        result.push({
          path: `${prefix}.${key}`,
          capability: value,
        });
      } else if (typeof value === "object" && value !== null) {
        result.push(...this.extractCapabilities(value, `${prefix}.${key}`));
      }
    }

    return result;
  }

  private getKey(tenantId: string, deviceId: string): string {
    return `${tenantId}:${deviceId}`;
  }
}
