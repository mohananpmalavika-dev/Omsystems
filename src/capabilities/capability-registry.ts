/**
 * Capability Registry
 * Tracks which features are REAL, READY, or PLANNED
 * Prevents confusion between implemented and simulated capabilities
 */

export enum CapabilityTier {
  REAL = 'REAL',       // Fully implemented, tested, deployed, connected to real data
  READY = 'READY',     // Code exists, tested, but deployment/configuration pending
  PLANNED = 'PLANNED', // UI/API exists, but actual backend logic is mock/simulation
}

export enum CapabilityStatus {
  ACTIVE = 'active',           // Running and operational
  INACTIVE = 'inactive',       // Not running (disabled or not started)
  ERROR = 'error',             // Running but encountering errors
  NOT_CONFIGURED = 'not_configured', // Missing required configuration
  UNAVAILABLE = 'unavailable', // Dependencies not available
}

export interface CapabilityDefinition {
  id: string;
  name: string;
  category: 'security' | 'analytics' | 'infrastructure' | 'operations' | 'integration';
  tier: CapabilityTier;
  status: CapabilityStatus;
  description: string;
  requiredCollectors?: string[];
  requiredServices?: string[];
  requiredConfig?: string[];
  healthCheck?: () => Promise<boolean>;
  metadata?: {
    version?: string;
    deployedAt?: string;
    lastVerified?: string;
    confidence?: number; // 0-100
  };
}

export interface CapabilityCheck {
  capabilityId: string;
  tier: CapabilityTier;
  status: CapabilityStatus;
  available: boolean;
  reason?: string;
  missingRequirements?: string[];
  checkedAt: string;
}

export class CapabilityRegistry {
  private capabilities: Map<string, CapabilityDefinition> = new Map();
  private lastCheckResults: Map<string, CapabilityCheck> = new Map();

  /**
   * Register a capability
   */
  register(capability: CapabilityDefinition): void {
    this.capabilities.set(capability.id, capability);
  }

  /**
   * Register multiple capabilities
   */
  registerMany(capabilities: CapabilityDefinition[]): void {
    for (const capability of capabilities) {
      this.register(capability);
    }
  }

  /**
   * Get all capabilities
   */
  getAll(): CapabilityDefinition[] {
    return Array.from(this.capabilities.values());
  }

  /**
   * Get capabilities by tier
   */
  getByTier(tier: CapabilityTier): CapabilityDefinition[] {
    return this.getAll().filter(c => c.tier === tier);
  }

  /**
   * Get capabilities by category
   */
  getByCategory(category: CapabilityDefinition['category']): CapabilityDefinition[] {
    return this.getAll().filter(c => c.category === category);
  }

  /**
   * Get capability by ID
   */
  get(id: string): CapabilityDefinition | undefined {
    return this.capabilities.get(id);
  }

  /**
   * Check if capability is available
   */
  async checkCapability(id: string): Promise<CapabilityCheck> {
    const capability = this.capabilities.get(id);
    
    if (!capability) {
      return {
        capabilityId: id,
        tier: CapabilityTier.PLANNED,
        status: CapabilityStatus.UNAVAILABLE,
        available: false,
        reason: 'capability_not_registered',
        checkedAt: new Date().toISOString(),
      };
    }

    const missingRequirements: string[] = [];

    // Check required collectors
    if (capability.requiredCollectors && capability.requiredCollectors.length > 0) {
      // TODO: Check if collectors are active
      // For now, assume all collectors are available if specified
    }

    // Check required services
    if (capability.requiredServices && capability.requiredServices.length > 0) {
      // TODO: Check if services are initialized
    }

    // Check required configuration
    if (capability.requiredConfig && capability.requiredConfig.length > 0) {
      for (const configKey of capability.requiredConfig) {
        if (!process.env[configKey]) {
          missingRequirements.push(`env:${configKey}`);
        }
      }
    }

    // Run health check if provided
    let healthy = true;
    if (capability.healthCheck) {
      try {
        healthy = await capability.healthCheck();
      } catch (error) {
        healthy = false;
      }
    }

    // Determine status and availability
    let status = capability.status;
    let available = true;
    let reason: string | undefined;

    if (missingRequirements.length > 0) {
      status = CapabilityStatus.NOT_CONFIGURED;
      available = false;
      reason = 'missing_required_configuration';
    } else if (!healthy) {
      status = CapabilityStatus.ERROR;
      available = false;
      reason = 'health_check_failed';
    } else if (capability.tier === CapabilityTier.PLANNED) {
      status = CapabilityStatus.UNAVAILABLE;
      available = false;
      reason = 'not_implemented';
    } else if (status === CapabilityStatus.INACTIVE) {
      available = false;
      reason = 'capability_disabled';
    }

    const check: CapabilityCheck = {
      capabilityId: id,
      tier: capability.tier,
      status,
      available,
      reason,
      missingRequirements: missingRequirements.length > 0 ? missingRequirements : undefined,
      checkedAt: new Date().toISOString(),
    };

    this.lastCheckResults.set(id, check);
    return check;
  }

  /**
   * Check all capabilities
   */
  async checkAll(): Promise<Map<string, CapabilityCheck>> {
    const results = new Map<string, CapabilityCheck>();

    await Promise.all(
      Array.from(this.capabilities.keys()).map(async (id) => {
        const check = await this.checkCapability(id);
        results.set(id, check);
      })
    );

    return results;
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    total: number;
    byTier: Record<CapabilityTier, number>;
    byStatus: Record<CapabilityStatus, number>;
    available: number;
    unavailable: number;
  } {
    const all = this.getAll();
    
    const byTier = {
      [CapabilityTier.REAL]: 0,
      [CapabilityTier.READY]: 0,
      [CapabilityTier.PLANNED]: 0,
    };

    const byStatus = {
      [CapabilityStatus.ACTIVE]: 0,
      [CapabilityStatus.INACTIVE]: 0,
      [CapabilityStatus.ERROR]: 0,
      [CapabilityStatus.NOT_CONFIGURED]: 0,
      [CapabilityStatus.UNAVAILABLE]: 0,
    };

    let available = 0;
    let unavailable = 0;

    for (const capability of all) {
      byTier[capability.tier]++;
      byStatus[capability.status]++;

      const check = this.lastCheckResults.get(capability.id);
      if (check?.available) {
        available++;
      } else {
        unavailable++;
      }
    }

    return {
      total: all.length,
      byTier,
      byStatus,
      available,
      unavailable,
    };
  }

  /**
   * Export for API response
   */
  async exportForAPI(): Promise<{
    capabilities: Array<CapabilityDefinition & { check: CapabilityCheck }>;
    summary: ReturnType<typeof this.getSummary>;
  }> {
    await this.checkAll();

    const capabilities = this.getAll().map(capability => ({
      ...capability,
      check: this.lastCheckResults.get(capability.id)!,
    }));

    return {
      capabilities,
      summary: this.getSummary(),
    };
  }

  /**
   * Clear all capabilities (for testing)
   */
  clear(): void {
    this.capabilities.clear();
    this.lastCheckResults.clear();
  }
}

/**
 * Singleton instance
 */
let registryInstance: CapabilityRegistry | null = null;

export function getCapabilityRegistry(): CapabilityRegistry {
  if (!registryInstance) {
    registryInstance = new CapabilityRegistry();
  }
  return registryInstance;
}

export function resetCapabilityRegistry(): void {
  registryInstance = null;
}
