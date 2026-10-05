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
import { CapabilityUnavailableError } from './specialty-inference-provider.js';
// ============================================================================
// Registry
// ============================================================================
export class InferenceRegistry {
    providers = new Map();
    healthCache = new Map();
    HEALTH_CACHE_TTL_MS = 5000; // 5 seconds
    /**
     * Register a provider for a capability
     */
    register(provider) {
        if (this.providers.has(provider.capability)) {
            console.warn(`Provider for capability '${provider.capability}' is already registered. Replacing.`);
        }
        this.providers.set(provider.capability, provider);
        console.log(`Registered provider for capability: ${provider.capability}`);
    }
    /**
     * Unregister a provider
     */
    unregister(capability) {
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
    get(capability) {
        return this.providers.get(capability);
    }
    /**
     * Get a provider (throws if not registered or unavailable)
     */
    require(capability) {
        const provider = this.providers.get(capability);
        if (!provider) {
            throw new CapabilityUnavailableError(capability, 'provider_not_registered');
        }
        return provider;
    }
    /**
     * Check if a capability is available and ready
     */
    async isAvailable(capability) {
        const provider = this.providers.get(capability);
        if (!provider)
            return false;
        try {
            return await provider.isAvailable();
        }
        catch (error) {
            console.error(`Failed to check availability for ${capability}:`, error);
            return false;
        }
    }
    /**
     * Get health status for a capability (with caching)
     */
    async getHealth(capability) {
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
        }
        catch (error) {
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
    async getAllHealth() {
        const results = new Map();
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
    getRegisteredCapabilities() {
        return Array.from(this.providers.keys());
    }
    /**
     * Check if any providers are registered
     */
    hasProviders() {
        return this.providers.size > 0;
    }
    /**
     * Get provider count
     */
    getProviderCount() {
        return this.providers.size;
    }
    /**
     * Clear health cache
     */
    clearHealthCache() {
        this.healthCache.clear();
    }
    /**
     * Cleanup all providers
     */
    async cleanup() {
        console.log('Cleaning up inference registry...');
        const cleanupPromises = Array.from(this.providers.values()).map(async (provider) => {
            if (provider.cleanup) {
                try {
                    await provider.cleanup();
                }
                catch (error) {
                    console.error(`Failed to cleanup provider ${provider.capability}:`, error);
                }
            }
        });
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
        const available = Array.from(allHealth.values()).filter((h) => h.available).length;
        const totalInferences = Array.from(allHealth.values()).reduce((sum, h) => sum + (h.totalInferences ?? 0), 0);
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
let registryInstance = null;
/**
 * Get or create the global inference registry
 */
export function getInferenceRegistry() {
    if (!registryInstance) {
        registryInstance = new InferenceRegistry();
    }
    return registryInstance;
}
/**
 * Reset the registry (primarily for testing)
 */
export function resetInferenceRegistry() {
    registryInstance = null;
}
