/**
 * Security Collector Registry
 * 
 * Central registry for all security evidence collectors.
 * Handles collector discovery, resolution, and lifecycle management.
 */

import { SecurityCollector, CollectorContext } from './base-collector';
import {
  SecurityEvidence,
  SecurityTarget,
  CollectorCapability,
} from '../contracts/security-evidence';
import {
  SecurityCapabilities,
  getDefaultCapabilities,
  CapabilityProvider,
} from '../contracts/target-capabilities';
import {
  CollectorPolicy,
  getCollectorPolicy,
} from '../contracts/collector-policy';

/**
 * Collector registration entry
 */
interface CollectorRegistration {
  /** The collector instance */
  collector: SecurityCollector;
  
  /** Control categories this collector provides */
  categories: string[];
  
  /** Priority (higher = preferred) */
  priority: number;
  
  /** When registered */
  registeredAt: Date;
  
  /** Is collector enabled? */
  enabled: boolean;
}

/**
 * Collector resolution result
 */
export interface CollectorResolution {
  /** Collector ID */
  collectorId: string;
  
  /** Collector instance */
  collector: SecurityCollector;
  
  /** Whether collector supports target */
  supported: boolean;
  
  /** Reason if not supported */
  unsupportedReason?: string;
}

/**
 * Collector coverage information
 */
export interface CollectorCoverage {
  /** Control ID */
  controlId: string;
  
  /** Available collectors */
  collectors: string[];
  
  /** Implementation status */
  status: 'implemented' | 'partial' | 'unsupported' | 'planned';
  
  /** Coverage notes */
  notes?: string;
}

/**
 * Security Collector Registry
 */
export class CollectorRegistry {
  private collectors = new Map<string, CollectorRegistration>();
  private categorizedCollectors = new Map<string, Set<string>>();
  private capabilityProvider?: CapabilityProvider;
  
  /**
   * Register a collector
   */
  register(
    collector: SecurityCollector,
    options: {
      categories?: string[];
      priority?: number;
      enabled?: boolean;
    } = {}
  ): void {
    const registration: CollectorRegistration = {
      collector,
      categories: options.categories || ['general'],
      priority: options.priority || 50,
      registeredAt: new Date(),
      enabled: options.enabled ?? true,
    };
    
    // Store by collector ID
    this.collectors.set(collector.id, registration);
    
    // Index by category
    for (const category of registration.categories) {
      if (!this.categorizedCollectors.has(category)) {
        this.categorizedCollectors.set(category, new Set());
      }
      this.categorizedCollectors.get(category)!.add(collector.id);
    }
    
    console.log(`[CollectorRegistry] Registered collector: ${collector.id} (${collector.capability})`);
  }
  
  /**
   * Unregister a collector
   */
  unregister(collectorId: string): boolean {
    const registration = this.collectors.get(collectorId);
    if (!registration) return false;
    
    // Remove from categories
    for (const category of registration.categories) {
      this.categorizedCollectors.get(category)?.delete(collectorId);
    }
    
    // Remove from main registry
    this.collectors.delete(collectorId);
    
    console.log(`[CollectorRegistry] Unregistered collector: ${collectorId}`);
    return true;
  }
  
  /**
   * Set capability provider
   */
  setCapabilityProvider(provider: CapabilityProvider): void {
    this.capabilityProvider = provider;
  }
  
  /**
   * Get collector by ID
   */
  get(collectorId: string): SecurityCollector | undefined {
    return this.collectors.get(collectorId)?.collector;
  }
  
  /**
   * Get all registered collectors
   */
  all(): SecurityCollector[] {
    return Array.from(this.collectors.values())
      .filter(reg => reg.enabled)
      .sort((a, b) => b.priority - a.priority)
      .map(reg => reg.collector);
  }
  
  /**
   * Get collectors by category
   */
  byCategory(category: string): SecurityCollector[] {
    const collectorIds = this.categorizedCollectors.get(category) || new Set();
    
    return Array.from(collectorIds)
      .map(id => this.collectors.get(id))
      .filter((reg): reg is CollectorRegistration => reg !== undefined && reg.enabled)
      .sort((a, b) => b.priority - a.priority)
      .map(reg => reg.collector);
  }
  
  /**
   * Resolve collectors for target
   */
  async resolve(
    target: SecurityTarget,
    requestedCollectors?: string[]
  ): Promise<CollectorResolution[]> {
    // Get target capabilities
    const capabilities = await this.getTargetCapabilities(target);
    
    // Determine which collectors to consider
    const candidates = requestedCollectors
      ? requestedCollectors.map(id => this.get(id)).filter((c): c is SecurityCollector => c !== undefined)
      : this.all();
    
    // Resolve each collector
    const resolutions: CollectorResolution[] = [];
    
    for (const collector of candidates) {
      const supported = collector.supports(target, capabilities);
      
      resolutions.push({
        collectorId: collector.id,
        collector,
        supported,
        unsupportedReason: supported ? undefined : `Target capabilities do not support ${collector.id}`,
      });
    }
    
    return resolutions;
  }
  
  /**
   * Get supported collectors for target
   */
  async getSupportedCollectors(target: SecurityTarget): Promise<SecurityCollector[]> {
    const resolutions = await this.resolve(target);
    return resolutions
      .filter(r => r.supported)
      .map(r => r.collector);
  }
  
  /**
   * Get target capabilities
   */
  private async getTargetCapabilities(target: SecurityTarget): Promise<SecurityCapabilities> {
    if (this.capabilityProvider && target.entityType) {
      try {
        return await this.capabilityProvider.detectCapabilities(
          target.entityType,
          target.deviceId || target.serverId || target.tenantId
        );
      } catch (error) {
        console.warn(`[CollectorRegistry] Capability detection failed, using defaults:`, error);
      }
    }
    
    // Fallback to default capabilities
    return getDefaultCapabilities(target.entityType || 'camera');
  }
  
  /**
   * Get collector coverage matrix
   */
  getCoverage(): CollectorCoverage[] {
    const coverageMap = new Map<string, CollectorCoverage>();
    
    // Build coverage from registered collectors
    for (const [collectorId, registration] of this.collectors.entries()) {
      const status: CollectorCoverage['status'] = 
        registration.collector.capability === 'LIVE' ? 'implemented' :
        registration.collector.capability === 'SIMULATED' ? 'partial' :
        'unsupported';
      
      for (const category of registration.categories) {
        const key = `${category}:${collectorId}`;
        
        if (!coverageMap.has(key)) {
          coverageMap.set(key, {
            controlId: collectorId,
            collectors: [collectorId],
            status,
          });
        }
      }
    }
    
    return Array.from(coverageMap.values());
  }
  
  /**
   * Get collector statistics
   */
  getStats(): {
    total: number;
    byCapability: Record<CollectorCapability, number>;
    byCategory: Record<string, number>;
    enabled: number;
    disabled: number;
  } {
    const stats = {
      total: this.collectors.size,
      byCapability: {
        LIVE: 0,
        SIMULATED: 0,
        UNAVAILABLE: 0,
      } as Record<CollectorCapability, number>,
      byCategory: {} as Record<string, number>,
      enabled: 0,
      disabled: 0,
    };
    
    for (const registration of this.collectors.values()) {
      // Count by capability
      stats.byCapability[registration.collector.capability]++;
      
      // Count by category
      for (const category of registration.categories) {
        stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
      }
      
      // Count enabled/disabled
      if (registration.enabled) {
        stats.enabled++;
      } else {
        stats.disabled++;
      }
    }
    
    return stats;
  }
  
  /**
   * Enable/disable collector
   */
  setEnabled(collectorId: string, enabled: boolean): boolean {
    const registration = this.collectors.get(collectorId);
    if (!registration) return false;
    
    registration.enabled = enabled;
    console.log(`[CollectorRegistry] Collector ${collectorId} ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }
  
  /**
   * Check if simulated collectors are registered (for production guard)
   */
  hasSimulatedCollectors(): boolean {
    for (const registration of this.collectors.values()) {
      if (registration.collector.capability === 'SIMULATED' && registration.enabled) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Disable all simulated collectors (for production)
   */
  disableSimulatedCollectors(): number {
    let count = 0;
    
    for (const [collectorId, registration] of this.collectors.entries()) {
      if (registration.collector.capability === 'SIMULATED' && registration.enabled) {
        registration.enabled = false;
        count++;
        console.warn(`[CollectorRegistry] Disabled simulated collector in production: ${collectorId}`);
      }
    }
    
    return count;
  }
}

/**
 * Singleton registry instance
 */
let registryInstance: CollectorRegistry | null = null;

/**
 * Get global collector registry
 */
export function getCollectorRegistry(): CollectorRegistry {
  if (!registryInstance) {
    registryInstance = new CollectorRegistry();
    
    // Production guard
    if (process.env.NODE_ENV === 'production') {
      const disabled = registryInstance.disableSimulatedCollectors();
      if (disabled > 0) {
        console.warn(`[CollectorRegistry] Disabled ${disabled} simulated collectors in production`);
      }
    }
  }
  
  return registryInstance;
}

/**
 * Reset registry (for testing)
 */
export function resetCollectorRegistry(): void {
  registryInstance = null;
}
