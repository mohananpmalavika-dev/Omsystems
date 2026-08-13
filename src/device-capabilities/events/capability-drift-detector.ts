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
} from "../capability.types.js";
import type { CapabilityEventBus } from "./capability-event-bus.js";

/**
 * Drift detection thresholds.
 */
export interface DriftDetectionConfig {
  /** Minimum confidence drop to trigger drift (0-1) */
  minConfidenceDrop: number;

  /** Time window to compare capabilities (in seconds) */
  comparisonWindowSeconds: number;

  /** Whether to detect firmware-related drift */
  detectFirmwareDrift: boolean;

  /** Whether to detect license-related drift */
  detectLicenseDrift: boolean;
}

const DEFAULT_CONFIG: DriftDetectionConfig = {
  minConfidenceDrop: 0.2,
  comparisonWindowSeconds: 3600, // 1 hour
  detectFirmwareDrift: true,
  detectLicenseDrift: true,
};

/**
 * Capability drift detector.
 */
export class CapabilityDriftDetector {
  private readonly config: DriftDetectionConfig;
  private readonly previousCapabilities = new Map<string, DeviceCapabilitySet>();

  constructor(
    private readonly eventBus: CapabilityEventBus,
    config?: Partial<DriftDetectionConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Detect drift between capability sets.
   */
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

    // Compare each capability domain
    driftEvents.push(...(this.compareCapabilities(previous.video, current.video, "video") as CapabilityDriftEvent[]));
    driftEvents.push(
      ...(this.compareCapabilities(previous.recording, current.recording, "recording") as CapabilityDriftEvent[]),
    );
    driftEvents.push(...(this.compareCapabilities(previous.ptz, current.ptz, "ptz") as CapabilityDriftEvent[]));
    driftEvents.push(...(this.compareCapabilities(previous.audio, current.audio, "audio") as CapabilityDriftEvent[]));
    driftEvents.push(...(this.compareCapabilities(previous.events, current.events, "events") as CapabilityDriftEvent[]));
    driftEvents.push(
      ...(this.compareCapabilities(previous.analytics, current.analytics, "analytics") as CapabilityDriftEvent[]),
    );
    driftEvents.push(
      ...(this.compareCapabilities(previous.storage, current.storage, "storage") as CapabilityDriftEvent[]),
    );
    driftEvents.push(
      ...(this.compareCapabilities(previous.network, current.network, "network") as CapabilityDriftEvent[]),
    );
    driftEvents.push(
      ...(this.compareCapabilities(previous.security, current.security, "security") as CapabilityDriftEvent[]),
    );
    driftEvents.push(
      ...(this.compareCapabilities(previous.management, current.management, "management") as CapabilityDriftEvent[]),
    );

    // Add context to events
    for (const event of driftEvents) {
      event.tenantId = current.tenantId;
      event.deviceId = current.deviceId;
      event.detectedAt = new Date();
      event.probableCause = this.inferCause(event, previous, current);
    }

    // Publish drift events
    for (const event of driftEvents) {
      await this.eventBus.publishCapabilityDrift(event);
    }

    return driftEvents;
  }

  /**
   * Compare capability objects and detect changes.
   */
  private compareCapabilities(
    previous: any,
    current: any,
    prefix: string,
  ): Omit<CapabilityDriftEvent, "tenantId" | "deviceId" | "detectedAt" | "probableCause">[] {
    const events: Omit<
      CapabilityDriftEvent,
      "tenantId" | "deviceId" | "detectedAt" | "probableCause"
    >[] = [];

    if (!previous && !current) return events;

    // Capability added
    if (!previous && current) {
      const capabilities = this.extractCapabilities(current, prefix);
      for (const cap of capabilities) {
        if (cap.capability.state === "SUPPORTED") {
          events.push({
            driftType: "CAPABILITY_ADDED",
            capability: cap.path as any,
            newValue: cap.capability.state,
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
            capability: cap.path as any,
            previousValue: cap.capability.state,
          });
        }
      }
      return events;
    }

    // Compare nested capabilities
    for (const key of Object.keys({ ...previous, ...current })) {
      const prevValue = previous?.[key];
      const currValue = current?.[key];

      if (this.isCapability(currValue)) {
        const prevCap = prevValue as Capability | undefined;
        const currCap = currValue as Capability;
        const capPath = `${prefix}.${key}`;

        // Check for state changes
        if (prevCap?.state !== currCap.state) {
          events.push(
            ...this.detectStateChange(capPath, prevCap, currCap),
          );
        }

        // Check for availability changes
        if (prevCap && prevCap.available !== currCap.available) {
          if (!currCap.available && prevCap.available) {
            events.push({
              driftType: "CAPABILITY_UNAVAILABLE",
              capability: capPath as any,
              previousValue: "available",
              newValue: "unavailable",
            });
          } else if (currCap.available && !prevCap.available) {
            events.push({
              driftType: "CAPABILITY_RECOVERED",
              capability: capPath as any,
              previousValue: "unavailable",
              newValue: "available",
            });
          }
        }

        // Check for confidence drops
        if (
          prevCap &&
          currCap.confidence < prevCap.confidence - this.config.minConfidenceDrop
        ) {
          events.push({
            driftType: "CAPABILITY_DEGRADED",
            capability: capPath as any,
            previousValue: prevCap.confidence.toFixed(2),
            newValue: currCap.confidence.toFixed(2),
          });
        }
      } else if (typeof currValue === "object" && currValue !== null) {
        // Recurse into nested objects
        events.push(
          ...this.compareCapabilities(prevValue, currValue, `${prefix}.${key}`),
        );
      }
    }

    return events;
  }

  /**
   * Detect state change drift.
   */
  private detectStateChange(
    path: string,
    previous: Capability | undefined,
    current: Capability,
  ): Omit<CapabilityDriftEvent, "tenantId" | "deviceId" | "detectedAt" | "probableCause">[] {
    const events: Omit<
      CapabilityDriftEvent,
      "tenantId" | "deviceId" | "detectedAt" | "probableCause"
    >[] = [];

    if (!previous) {
      if (current.state === "SUPPORTED") {
        events.push({
          driftType: "CAPABILITY_ADDED",
          capability: path as any,
          newValue: current.state,
        });
      }
      return events;
    }

    // State transitions
    if (previous.state === "SUPPORTED" && current.state !== "SUPPORTED") {
      if (current.state === "UNAVAILABLE") {
        events.push({
          driftType: "CAPABILITY_UNAVAILABLE",
          capability: path as any,
          previousValue: previous.state,
          newValue: current.state,
        });
      } else if (current.state === "DEGRADED") {
        events.push({
          driftType: "CAPABILITY_DEGRADED",
          capability: path as any,
          previousValue: previous.state,
          newValue: current.state,
        });
      } else if (current.state === "UNSUPPORTED") {
        events.push({
          driftType: "CAPABILITY_REMOVED",
          capability: path as any,
          previousValue: previous.state,
          newValue: current.state,
        });
      }
    } else if (previous.state !== "SUPPORTED" && current.state === "SUPPORTED") {
      events.push({
        driftType: "CAPABILITY_RECOVERED",
        capability: path as any,
        previousValue: previous.state,
        newValue: current.state,
      });
    } else if (previous.state !== current.state) {
      events.push({
        driftType: "CAPABILITY_CONFIGURATION_CHANGED",
        capability: path as any,
        previousValue: previous.state,
        newValue: current.state,
      });
    }

    return events;
  }

  /**
   * Infer probable cause of drift.
   */
  private inferCause(
    event: Omit<CapabilityDriftEvent, "probableCause">,
    previous: DeviceCapabilitySet,
    current: DeviceCapabilitySet,
  ): string | undefined {
    // Check for firmware changes
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

    // Check for credential issues
    if (
      event.driftType === "CAPABILITY_UNAVAILABLE" &&
      event.capability.includes("network")
    ) {
      return "Possible credential expiry or network authentication failure";
    }

    // Check for security-related drift
    if (event.capability.includes("security")) {
      if (event.driftType === "CAPABILITY_REMOVED" || event.driftType === "CAPABILITY_UNAVAILABLE") {
        return "Security configuration change or certificate expiry";
      }
    }

    // Check for storage-related drift
    if (event.capability.includes("storage")) {
      if (event.driftType === "CAPABILITY_UNAVAILABLE") {
        return "Storage device removed or failed";
      }
    }

    // Generic inference based on drift type
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

  /**
   * Check if object is a Capability.
   */
  private isCapability(obj: any): obj is Capability {
    return (
      obj &&
      typeof obj === "object" &&
      "state" in obj &&
      "available" in obj &&
      "confidence" in obj
    );
  }

  /**
   * Extract all capabilities from an object.
   */
  private extractCapabilities(
    obj: any,
    prefix: string,
  ): Array<{ path: string; capability: Capability }> {
    const result: Array<{ path: string; capability: Capability }> = [];

    for (const [key, value] of Object.entries(obj)) {
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

  /**
   * Get cache key.
   */
  private getKey(tenantId: string, deviceId: string): string {
    return `${tenantId}:${deviceId}`;
  }
}
