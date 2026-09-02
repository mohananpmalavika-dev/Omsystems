/**
 * Authoritative Sentinel Grid Capability Registry
 * 
 * Provides truthful, evidence-grounded capability tracking across the platform.
 * Strictly separates:
 * 1. Product Maturity (Release Truth): PRODUCTION | BETA | EXPERIMENTAL | NOT_IMPLEMENTED
 * 2. Runtime State (Operational Health): HEALTHY | DEGRADED | DOWN | NOT_CONFIGURED | DISABLED | UNKNOWN
 * 3. Device Support: Handled independently by DeviceCapabilityRegistry
 */

import {
  CapabilityMaturity,
  CapabilityRuntimeState,
  type CapabilityCategory,
  type PlatformCapability,
  type CapabilitySummary,
  type CapabilityBlocker,
  type CapabilityDeploymentPolicy,
  DEFAULT_STANDARD_DEPLOYMENT_POLICY,
} from '../../packages/contracts/src/capabilities/capability-types.js';
import { determineMaximumAllowedMaturity } from '../../packages/contracts/src/capabilities/evidence-rules.js';
import { PLATFORM_CAPABILITIES } from './platform-capabilities.js';

// ============================================================================
// BACKWARD COMPATIBILITY ADAPTERS (DEPRECATED)
// ============================================================================

/** @deprecated Use CapabilityMaturity instead */
export enum CapabilityTier {
  REAL = 'REAL',
  READY = 'READY',
  PLANNED = 'PLANNED',
}

/** @deprecated Use CapabilityRuntimeState instead */
export enum CapabilityStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
  NOT_CONFIGURED = 'not_configured',
  UNAVAILABLE = 'unavailable',
}

/** @deprecated Use PlatformCapability instead */
export type CapabilityDefinition = PlatformCapability;

/**
 * Map legacy tier to canonical maturity
 */
export function legacyTierToMaturity(tier: CapabilityTier): CapabilityMaturity {
  switch (tier) {
    case CapabilityTier.REAL:
      return CapabilityMaturity.PRODUCTION;
    case CapabilityTier.READY:
      return CapabilityMaturity.BETA;
    case CapabilityTier.PLANNED:
    default:
      return CapabilityMaturity.NOT_IMPLEMENTED;
  }
}

// ============================================================================
// CANONICAL CAPABILITY REGISTRY CLASS
// ============================================================================

export class PlatformCapabilityRegistry {
  private capabilities = new Map<string, PlatformCapability>();
  private deploymentPolicy: CapabilityDeploymentPolicy = { ...DEFAULT_STANDARD_DEPLOYMENT_POLICY };

  constructor(initialCapabilities: PlatformCapability[] = PLATFORM_CAPABILITIES) {
    for (const cap of initialCapabilities) {
      this.capabilities.set(cap.id, { ...cap });
    }
  }

  /**
   * Set dynamic deployment policy for the platform
   */
  setDeploymentPolicy(policy: Partial<CapabilityDeploymentPolicy>): void {
    this.deploymentPolicy = {
      ...this.deploymentPolicy,
      ...policy,
    };
  }

  /**
   * Get active deployment policy
   */
  getDeploymentPolicy(): CapabilityDeploymentPolicy {
    return { ...this.deploymentPolicy };
  }

  /**
   * Get a capability by its unique machine ID
   */
  get(id: string): PlatformCapability | undefined {
    return this.capabilities.get(id);
  }

  /**
   * Get all registered platform capabilities
   */
  getAll(): PlatformCapability[] {
    return Array.from(this.capabilities.values());
  }

  /**
   * Get capabilities filtered by product maturity
   */
  getByMaturity(maturity: CapabilityMaturity): PlatformCapability[] {
    return this.getAll().filter((c) => c.maturity === maturity);
  }

  /**
   * Get capabilities filtered by domain category
   */
  getByCategory(category: CapabilityCategory | string): PlatformCapability[] {
    const normalized = String(category).toUpperCase();
    return this.getAll().filter((c) => c.category.toUpperCase() === normalized);
  }

  /**
   * Get capabilities filtered by current runtime state
   */
  getByRuntimeState(state: CapabilityRuntimeState): PlatformCapability[] {
    return this.getAll().filter((c) => c.runtime.state === state);
  }

  /**
   * Register or update a platform capability definition
   */
  register(capability: PlatformCapability): void {
    this.capabilities.set(capability.id, capability);
  }

  /**
   * Register multiple capabilities
   */
  registerMany(capabilities: PlatformCapability[]): void {
    for (const cap of capabilities) {
      this.register(cap);
    }
  }

  /**
   * Update dynamic runtime operational state for a capability
   */
  updateRuntimeState(
    id: string,
    state: CapabilityRuntimeState,
    reason?: string,
    errorCode?: string
  ): boolean {
    const capability = this.capabilities.get(id);
    if (!capability) return false;

    capability.runtime = {
      state,
      reason,
      errorCode,
      checkedAt: new Date().toISOString(),
    };
    return true;
  }

  /**
   * Check whether a capability is currently usable
   */
  canUse(id: string): { usable: boolean; reason?: string } {
    const cap = this.capabilities.get(id);
    if (!cap) {
      return { usable: false, reason: 'capability_not_registered' };
    }

    if (cap.maturity === CapabilityMaturity.NOT_IMPLEMENTED) {
      return { usable: false, reason: 'feature_not_implemented' };
    }

    if (cap.maturity === CapabilityMaturity.EXPERIMENTAL && !this.deploymentPolicy.allowExperimental) {
      return { usable: false, reason: 'experimental_features_disabled' };
    }

    if (cap.maturity === CapabilityMaturity.BETA && !this.deploymentPolicy.allowBeta) {
      return { usable: false, reason: 'beta_features_disabled' };
    }

    if (cap.runtime.state === CapabilityRuntimeState.DOWN) {
      return { usable: false, reason: 'runtime_service_down' };
    }

    if (cap.runtime.state === CapabilityRuntimeState.DISABLED) {
      return { usable: false, reason: 'runtime_service_disabled' };
    }

    if (cap.runtime.state === CapabilityRuntimeState.NOT_CONFIGURED) {
      return { usable: false, reason: 'runtime_not_configured' };
    }

    return { usable: true };
  }

  /**
   * Calculate summary metrics across all capabilities
   */
  getSummary(): CapabilitySummary {
    const all = this.getAll();
    const byCategory: Record<CapabilityCategory, number> = {
      VIDEO: 0,
      RECORDING: 0,
      EVIDENCE: 0,
      ANALYTICS: 0,
      HA: 0,
      SECURITY: 0,
      OPERATIONS: 0,
      STORAGE: 0,
      EDGE: 0,
      INTEGRATION: 0,
    };

    const byMaturity = {
      production: 0,
      beta: 0,
      experimental: 0,
      notImplemented: 0,
    };

    const byRuntimeState = {
      healthy: 0,
      degraded: 0,
      down: 0,
      notConfigured: 0,
      disabled: 0,
      unknown: 0,
    };

    for (const cap of all) {
      // By category
      if (byCategory[cap.category] !== undefined) {
        byCategory[cap.category]++;
      }

      // By maturity
      switch (cap.maturity) {
        case CapabilityMaturity.PRODUCTION:
          byMaturity.production++;
          break;
        case CapabilityMaturity.BETA:
          byMaturity.beta++;
          break;
        case CapabilityMaturity.EXPERIMENTAL:
          byMaturity.experimental++;
          break;
        case CapabilityMaturity.NOT_IMPLEMENTED:
          byMaturity.notImplemented++;
          break;
      }

      // By runtime state
      switch (cap.runtime.state) {
        case CapabilityRuntimeState.HEALTHY:
          byRuntimeState.healthy++;
          break;
        case CapabilityRuntimeState.DEGRADED:
          byRuntimeState.degraded++;
          break;
        case CapabilityRuntimeState.DOWN:
          byRuntimeState.down++;
          break;
        case CapabilityRuntimeState.NOT_CONFIGURED:
          byRuntimeState.notConfigured++;
          break;
        case CapabilityRuntimeState.DISABLED:
          byRuntimeState.disabled++;
          break;
        case CapabilityRuntimeState.UNKNOWN:
        default:
          byRuntimeState.unknown++;
          break;
      }
    }

    return {
      total: all.length,
      byMaturity,
      byRuntimeState,
      byCategory,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Identify all production blockers across capabilities
   */
  getBlockers(): CapabilityBlocker[] {
    const blockers: CapabilityBlocker[] = [];

    for (const cap of this.getAll()) {
      const items: string[] = [];

      if (cap.maturity === CapabilityMaturity.NOT_IMPLEMENTED) {
        if (!cap.implementation.backend) items.push('Missing backend implementation');
        if (!cap.implementation.api) items.push('Missing API routes');
        if (cap.runtime.reason) items.push(cap.runtime.reason);
      }

      if (cap.maturity === CapabilityMaturity.EXPERIMENTAL) {
        items.push('Accuracy and performance validation pending in staging environment');
        if (cap.limitations) items.push(...cap.limitations);
      }

      if (cap.maturity === CapabilityMaturity.BETA) {
        if (!cap.verification.e2eTests) items.push('End-to-end scale / HA tests pending');
      }

      if (cap.runtime.state === CapabilityRuntimeState.DOWN || cap.runtime.state === CapabilityRuntimeState.DEGRADED) {
        items.push(`Runtime issue: ${cap.runtime.reason || cap.runtime.state}`);
      }

      if (items.length > 0) {
        blockers.push({
          capabilityId: cap.id,
          name: cap.name,
          category: cap.category,
          maturity: cap.maturity,
          blockers: items,
        });
      }
    }

    return blockers;
  }

  /**
   * Export comprehensive audit payload for administration
   */
  getAuditReport(): {
    total: number;
    summary: CapabilitySummary;
    capabilities: PlatformCapability[];
    blockers: CapabilityBlocker[];
    generatedAt: string;
  } {
    return {
      total: this.capabilities.size,
      summary: this.getSummary(),
      capabilities: this.getAll(),
      blockers: this.getBlockers(),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Clear all capabilities (for testing purposes)
   */
  clear(): void {
    this.capabilities.clear();
  }

  /**
   * Reset registry to canonical baseline
   */
  reset(): void {
    this.capabilities.clear();
    for (const cap of PLATFORM_CAPABILITIES) {
      this.capabilities.set(cap.id, { ...cap });
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE & EXPORTS
// ============================================================================

let platformCapabilityRegistryInstance: PlatformCapabilityRegistry | null = null;

export function getCapabilityRegistry(): PlatformCapabilityRegistry {
  if (!platformCapabilityRegistryInstance) {
    platformCapabilityRegistryInstance = new PlatformCapabilityRegistry();
  }
  return platformCapabilityRegistryInstance;
}

export function resetCapabilityRegistry(): void {
  if (platformCapabilityRegistryInstance) {
    platformCapabilityRegistryInstance.reset();
  } else {
    platformCapabilityRegistryInstance = new PlatformCapabilityRegistry();
  }
}

/** @deprecated Alias for backward compatibility */
export const CapabilityRegistry = PlatformCapabilityRegistry;
