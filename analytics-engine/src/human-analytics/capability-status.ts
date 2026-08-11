/**
 * Capability Status Registry
 * Tracks the availability and health of analytics capabilities
 */

export type CapabilityStatus = "ready" | "degraded" | "unavailable" | "initializing";

export interface AnalyticsCapability {
  name:
    | "person_detection"
    | "tracking"
    | "pose_estimation"
    | "fight_detection"
    | "panic_detection"
    | "entry_exit"
    | "cross_camera_journey"
    | "reid_extraction";
  status: CapabilityStatus;
  reason?: string;
  modelVersion?: string;
  updatedAt: Date;
}

export interface CapabilityCheckResult {
  available: boolean;
  reason?: string;
  capability?: AnalyticsCapability;
}

/**
 * Registry for tracking capability status
 */
export class CapabilityStatusRegistry {
  private capabilities = new Map<AnalyticsCapability["name"], AnalyticsCapability>();

  /**
   * Update capability status
   */
  updateCapability(capability: AnalyticsCapability): void {
    this.capabilities.set(capability.name, capability);
  }

  /**
   * Get capability status
   */
  getCapability(name: AnalyticsCapability["name"]): AnalyticsCapability | undefined {
    return this.capabilities.get(name);
  }

  /**
   * Check if a capability is available
   */
  isAvailable(name: AnalyticsCapability["name"]): boolean {
    const capability = this.capabilities.get(name);
    return capability?.status === "ready";
  }

  /**
   * Check capability with detailed result
   */
  checkCapability(name: AnalyticsCapability["name"]): CapabilityCheckResult {
    const capability = this.capabilities.get(name);
    
    if (!capability) {
      return {
        available: false,
        reason: `Capability ${name} not registered`,
      };
    }

    if (capability.status !== "ready") {
      return {
        available: false,
        reason: capability.reason || `Capability ${name} is ${capability.status}`,
        capability,
      };
    }

    return {
      available: true,
      capability,
    };
  }

  /**
   * Get all capabilities
   */
  getAllCapabilities(): AnalyticsCapability[] {
    return Array.from(this.capabilities.values());
  }

  /**
   * Get health summary
   */
  getHealthSummary(): {
    total: number;
    ready: number;
    degraded: number;
    unavailable: number;
    initializing: number;
  } {
    const summary = {
      total: this.capabilities.size,
      ready: 0,
      degraded: 0,
      unavailable: 0,
      initializing: 0,
    };

    for (const capability of this.capabilities.values()) {
      summary[capability.status]++;
    }

    return summary;
  }
}

/**
 * Global capability registry instance
 */
let globalRegistry: CapabilityStatusRegistry | undefined;

export function getCapabilityRegistry(): CapabilityStatusRegistry {
  if (!globalRegistry) {
    globalRegistry = new CapabilityStatusRegistry();
  }
  return globalRegistry;
}
