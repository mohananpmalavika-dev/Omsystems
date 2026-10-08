/**
 * Capability Registry
 * 
 * Tracks which capabilities/services are actually available.
 * Commands can query this to determine if their dependencies are met.
 * Makes assistant responses accurate about system state.
 */

/**
 * Capability health status
 */
export enum CapabilityHealth {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNAVAILABLE = 'UNAVAILABLE',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Capability information
 */
export interface CapabilityInfo {
  /** Unique capability identifier */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Is this capability available? */
  available: boolean;
  
  /** Health status */
  health: CapabilityHealth;
  
  /** Optional reason if unavailable */
  unavailableReason?: string;
  
  /** Last health check timestamp */
  lastChecked?: Date;
  
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Capability provider interface
 * Services implement this to report their availability
 */
export interface CapabilityProvider {
  getCapabilityId(): string;
  isAvailable(): Promise<boolean>;
  getHealth(): Promise<CapabilityHealth>;
}

/**
 * Capability Registry
 * 
 * Centralized tracking of system capabilities
 */
export class AssistantCapabilityRegistry {
  private capabilities: Map<string, CapabilityInfo> = new Map();
  private providers: Map<string, CapabilityProvider> = new Map();
  
  /**
   * Register a capability
   */
  register(capability: CapabilityInfo): void {
    this.capabilities.set(capability.id, capability);
    console.log(`[CapabilityRegistry] Registered capability: ${capability.id} (available: ${capability.available})`);
  }
  
  /**
   * Register a capability provider
   */
  registerProvider(provider: CapabilityProvider): void {
    const id = provider.getCapabilityId();
    this.providers.set(id, provider);
    console.log(`[CapabilityRegistry] Registered provider for: ${id}`);
  }
  
  /**
   * Check if a capability is available
   */
  async isAvailable(capabilityId: string): Promise<boolean> {
    // Check provider first if available
    const provider = this.providers.get(capabilityId);
    if (provider) {
      try {
        const available = await provider.isAvailable();
        
        // Update cached capability info
        const capability = this.capabilities.get(capabilityId);
        if (capability) {
          capability.available = available;
          capability.lastChecked = new Date();
        }
        
        return available;
      } catch (error) {
        console.error(`[CapabilityRegistry] Error checking provider ${capabilityId}:`, error);
        return false;
      }
    }
    
    // Fall back to cached info
    const capability = this.capabilities.get(capabilityId);
    return capability?.available ?? false;
  }
  
  /**
   * Get capability health
   */
  async getHealth(capabilityId: string): Promise<CapabilityHealth> {
    // Check provider first if available
    const provider = this.providers.get(capabilityId);
    if (provider) {
      try {
        const health = await provider.getHealth();
        
        // Update cached capability info
        const capability = this.capabilities.get(capabilityId);
        if (capability) {
          capability.health = health;
          capability.lastChecked = new Date();
        }
        
        return health;
      } catch (error) {
        console.error(`[CapabilityRegistry] Error checking health ${capabilityId}:`, error);
        return CapabilityHealth.UNKNOWN;
      }
    }
    
    // Fall back to cached info
    const capability = this.capabilities.get(capabilityId);
    return capability?.health ?? CapabilityHealth.UNKNOWN;
  }
  
  /**
   * Get capability information
   */
  getCapability(capabilityId: string): CapabilityInfo | undefined {
    return this.capabilities.get(capabilityId);
  }
  
  /**
   * Check if all required capabilities are available
   */
  async checkRequirements(requiredCapabilities: string[]): Promise<{
    allAvailable: boolean;
    missing: string[];
    unavailable: string[];
  }> {
    const missing: string[] = [];
    const unavailable: string[] = [];
    
    for (const capId of requiredCapabilities) {
      const capability = this.capabilities.get(capId);
      
      if (!capability) {
        missing.push(capId);
        continue;
      }
      
      const available = await this.isAvailable(capId);
      if (!available) {
        unavailable.push(capId);
      }
    }
    
    return {
      allAvailable: missing.length === 0 && unavailable.length === 0,
      missing,
      unavailable
    };
  }
  
  /**
   * Mark capability as available
   */
  markAvailable(capabilityId: string, reason?: string): void {
    let capability = this.capabilities.get(capabilityId);
    
    if (!capability) {
      // Auto-register if not exists
      capability = {
        id: capabilityId,
        name: capabilityId,
        available: true,
        health: CapabilityHealth.HEALTHY,
        lastChecked: new Date()
      };
      this.capabilities.set(capabilityId, capability);
    } else {
      capability.available = true;
      capability.health = CapabilityHealth.HEALTHY;
      capability.unavailableReason = undefined;
      capability.lastChecked = new Date();
    }
  }
  
  /**
   * Mark capability as unavailable
   */
  markUnavailable(capabilityId: string, reason: string): void {
    let capability = this.capabilities.get(capabilityId);
    
    if (!capability) {
      // Auto-register if not exists
      capability = {
        id: capabilityId,
        name: capabilityId,
        available: false,
        health: CapabilityHealth.UNAVAILABLE,
        unavailableReason: reason,
        lastChecked: new Date()
      };
      this.capabilities.set(capabilityId, capability);
    } else {
      capability.available = false;
      capability.health = CapabilityHealth.UNAVAILABLE;
      capability.unavailableReason = reason;
      capability.lastChecked = new Date();
    }
  }
  
  /**
   * List all capabilities
   */
  listCapabilities(): CapabilityInfo[] {
    return Array.from(this.capabilities.values());
  }
  
  /**
   * List available capabilities
   */
  listAvailable(): CapabilityInfo[] {
    return Array.from(this.capabilities.values())
      .filter(cap => cap.available);
  }
  
  /**
   * List unavailable capabilities
   */
  listUnavailable(): CapabilityInfo[] {
    return Array.from(this.capabilities.values())
      .filter(cap => !cap.available);
  }
  
  /**
   * Clear all capabilities (for testing)
   */
  clear(): void {
    this.capabilities.clear();
    this.providers.clear();
  }
  
  /**
   * Refresh all capabilities from providers
   */
  async refreshAll(): Promise<void> {
    const promises = Array.from(this.providers.entries()).map(async ([id, provider]) => {
      try {
        const available = await provider.isAvailable();
        const health = await provider.getHealth();
        
        const capability = this.capabilities.get(id);
        if (capability) {
          capability.available = available;
          capability.health = health;
          capability.lastChecked = new Date();
        }
      } catch (error) {
        console.error(`[CapabilityRegistry] Error refreshing ${id}:`, error);
      }
    });
    
    await Promise.all(promises);
  }
}

/**
 * Global capability registry instance
 */
export const capabilityRegistry = new AssistantCapabilityRegistry();

/**
 * Standard capability IDs
 */
export const AssistantCapabilities = {
  // Camera capabilities
  CAMERA_CONTROL: 'camera-control',
  CAMERA_SERVICE: 'camera-service',
  CAMERA_STATUS: 'camera-status',
  
  // Detection/search capabilities
  DETECTION_SEARCH: 'detection-search',
  VECTOR_SEARCH: 'vector-search',
  EVENT_STORE: 'event-store',
  
  // Investigation capabilities
  REID: 'reid',
  TIMELINE: 'timeline',
  INVESTIGATION_SERVICE: 'investigation-service',
  
  // Analytics capabilities
  ANALYTICS_SERVICE: 'analytics-service',
  OCCUPANCY_TRACKING: 'occupancy-tracking',
  PEOPLE_COUNTING: 'people-counting',
  VEHICLE_COUNTING: 'vehicle-counting',
  
  // Report capabilities
  REPORT_SERVICE: 'report-service',
  INCIDENT_ANALYTICS: 'incident-analytics',
  
  // System capabilities
  SYSTEM_HEALTH: 'system-health',
  INCIDENT_SERVICE: 'incident-service',
  STORAGE_SERVICE: 'storage-service'
} as const;
