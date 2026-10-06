/**
 * Capability Status Registry
 * Tracks the availability and health of analytics capabilities
 */
/**
 * Registry for tracking capability status
 */
export class CapabilityStatusRegistry {
    capabilities = new Map();
    /**
     * Update capability status
     */
    updateCapability(capability) {
        this.capabilities.set(capability.name, capability);
    }
    /**
     * Get capability status
     */
    getCapability(name) {
        return this.capabilities.get(name);
    }
    /**
     * Check if a capability is available
     */
    isAvailable(name) {
        const capability = this.capabilities.get(name);
        return capability?.status === "ready";
    }
    /**
     * Check capability with detailed result
     */
    checkCapability(name) {
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
    getAllCapabilities() {
        return Array.from(this.capabilities.values());
    }
    /**
     * Get health summary
     */
    getHealthSummary() {
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
let globalRegistry;
export function getCapabilityRegistry() {
    if (!globalRegistry) {
        globalRegistry = new CapabilityStatusRegistry();
    }
    return globalRegistry;
}
