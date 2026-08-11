/**
 * Inference Registry
 * 
 * Central registry for all specialty inference providers. Manages:
 * - Provider registration and discovery
 * - Dependency resolution
 * - Graceful degradation when providers are unavailable
 * - Provider health monitoring
 * 
 * This is the single source of truth for inference capability availability.
 */

import type {
  SpecialtyInferenceProvider,
  InferenceCapability,
  InferenceHealth,
} from './specialty-inference-provider.js';
import { CapabilityUnavailableError } from './specialty-inference-provider.js';

// ============================================================================
// Registry
// ============================================================================

export class InferenceRegistry {
  private providers = new Map<InferenceCapability, SpecialtyInferenceProvider>();
  private healthCache = new Map<InferenceCapability, {
    health: InferenceHealth;
    cachedAt: Date;
  }>();

  private readonly HEALTH_CACHE_TTL_MS = 5000; // 5 seconds

  /**
   * Register a provider for a capability
   */
  register(provider: SpecialtyInferenceProvider): void {
    if (this.providers.has(provider.capability)) {
      console.warn(
        `Provider for capability '${provider.capability}' is already registered. Replacing.`
      );
    }

    this.providers.set(provider.capability, provider);
    console.log(`Registered provider for capability: ${provider.capability}`);
  }

  /**
   * Unregister a provider
   */
  unregister(capability: InferenceCapability): boolean {
    const removed = this.providers.delete(capability);
    if (removed) {
      this.healthCache.delete(capability);
      console.log(`Unregistered provider for capability: ${capability}`);
    }
    return removed;
  }

  /**
   * Get a provider (returns undefined if not registered)
   */
  get(capability: InferenceCapability): SpecialtyInferenceProvider | undefined {
    return this.providers.get(capability);
  }

  /**
   * Get a provider (throws if not registered or unavailable)
   */
  require(capability: InferenceCapability): SpecialtyInferenceProvider {
    const provider = this.providers.get(capability);
    if (!provider) {
      throw new CapabilityUnavailableError(
        capability,
        'provider_not_registered'
      );
    }
    return provider;
  }

  /**
   * Check if a capability is available and ready
   */
  async isAvailable(capability: InferenceCapability): Promise<boolean> {
    const provider = this.providers.get(capability);
    if (!provider) return false;

    try {
      return await provider.isAvailable();
    } catch (error) {
      console.error(
        `Failed to check availability for ${capability}:`,
        error
      );
      return false;
    }
  }

  /**
   * Get health status for a capability (with caching)
   */
  async getHealth(capability: InferenceCapability): Promise<InferenceHealth | null> {
    const provider = this.providers.get(capability);
    if (!provider) {
      return {
        available: false,
        error: 'provider_not_registered',
      };
    }

    // Check cache
    const cached = this.healthCache.get(capability);
    if (cached) {
      const age = Date.now() - cached.cachedAt.getTime();
      if (age < this.HEALTH_CACHE_TTL_MS) {
        return cached.health;
      }
    }

    // Fetch fresh health
    try {
      const health = await provider.health();
      this.healthCache.set(capability, {
        health,
        cachedAt: new Date(),
      });
      return health;
    } catch (error) {
      console.error(`Failed to get health for ${capability}:`, error);
      return {
        available: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get health for all registered providers
   */
  async getAllHealth(): Promise<Map<InferenceCapability, InferenceHealth>> {
    const results = new Map<InferenceCapability, InferenceHealth>();

    const promises = Array.from(this.providers.keys()).map(async (capability) => {
      const health = await this.getHealth(capability);
      if (health) {
        results.set(capability, health);
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Get all registered capabilities
   */
  getRegisteredCapabilities(): InferenceCapability[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if any providers are registered
   */
  hasProviders(): boolean {
    return this.providers.size > 0;
  }

  /**
   * Get provider count
   */
  getProviderCount(): number {
    return this.providers.size;
  }

  /**
   * Clear health cache
   */
  clearHealthCache(): void {
    this.healthCache.clear();
  }

  /**
   * Cleanup all providers
   */
  async cleanup(): Promise<void> {
    console.log('Cleaning up inference registry...');

    const cleanupPromises = Array.from(this.providers.values()).map(
      async (provider) => {
        if (provider.cleanup) {
          try {
            await provider.cleanup();
          } catch (error) {
            console.error(
              `Failed to cleanup provider ${provider.capability}:`,
              error
            );
          }
        }
      }
    );

    await Promise.all(cleanupPromises);
    this.providers.clear();
    this.healthCache.clear();
    console.log('Inference registry cleaned up');
  }

  /**
   * Get registry statistics
   */
  async getStatistics() {
    const allHealth = await this.getAllHealth();
    const available = Array.from(allHealth.values()).filter(
      (h) => h.available
    ).length;

    const totalInferences = Array.from(allHealth.values()).reduce(
      (sum, h) => sum + (h.totalInferences ?? 0),
      0
    );

    const avgLatency = Array.from(allHealth.values())
      .filter((h) => h.latencyMs !== undefined)
      .reduce((sum, h) => sum + (h.latencyMs ?? 0), 0) / allHealth.size || 0;

    return {
      totalProviders: this.providers.size,
      availableProviders: available,
      unavailableProviders: this.providers.size - available,
      totalInferences,
      avgLatencyMs: avgLatency,
      capabilities: Array.from(allHealth.entries()).map(([capability, health]) => ({
        capability,
        available: health.available,
        latencyMs: health.latencyMs,
        totalInferences: health.totalInferences,
        failureRate: health.failureRate,
      })),
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let registryInstance: InferenceRegistry | null = null;

/**
 * Get or create the global inference registry
 */
export function getInferenceRegistry(): InferenceRegistry {
  if (!registryInstance) {
    registryInstance = new InferenceRegistry();
  }
  return registryInstance;
}

/**
 * Reset the registry (primarily for testing)
 */
export function resetInferenceRegistry(): void {
  registryInstance = null;
}
