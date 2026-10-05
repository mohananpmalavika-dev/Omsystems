/**
 * Heatmap Registry
 *
 * Manages heatmap accumulators for multiple cameras with:
 * - Per-camera configuration
 * - Automatic accumulator lifecycle
 * - Event bus subscriptions
 * - Periodic persistence
 * - Configuration management
 */
import { HeatmapAccumulator } from './heatmap-accumulator.js';
import { DEFAULT_HEATMAP_CONFIG, } from './heatmap-types.js';
/**
 * Registry for managing heatmap accumulators across multiple cameras
 */
export class HeatmapRegistry {
    trackingBus;
    store;
    config;
    /** Camera heatmap accumulators */
    accumulators = new Map();
    /** Camera configurations */
    cameraConfigs = new Map();
    /** Event bus subscription */
    unsubscribe;
    /** Periodic timers */
    persistTimer;
    cleanupTimer;
    constructor(config) {
        this.trackingBus = config.trackingBus;
        this.store = config.store;
        this.config = {
            persistIntervalMs: config.persistIntervalMs ?? 60000, // 1 minute
            cleanupIntervalMs: config.cleanupIntervalMs ?? 300000, // 5 minutes
            defaultConfig: {
                ...DEFAULT_HEATMAP_CONFIG,
                ...config.defaultConfig,
            },
        };
    }
    /**
     * Start heatmap accumulation
     */
    start() {
        // Subscribe to tracking observations
        this.unsubscribe = this.trackingBus.subscribe(observation => this.handleObservation(observation));
        // Start periodic persistence
        this.startPersistence();
        // Start periodic cleanup
        this.startCleanup();
        console.log('[HeatmapRegistry] Started');
    }
    /**
     * Stop heatmap accumulation
     */
    async stop() {
        // Unsubscribe from tracking bus
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = undefined;
        }
        // Stop timers
        if (this.persistTimer) {
            clearInterval(this.persistTimer);
            this.persistTimer = undefined;
        }
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
        // Final persistence
        await this.persistAll();
        console.log('[HeatmapRegistry] Stopped');
    }
    /**
     * Register camera for heatmap accumulation
     */
    registerCamera(config) {
        const key = this.getCameraKey(config.tenantId, config.cameraId);
        this.cameraConfigs.set(key, config);
        if (config.enabled) {
            this.createAccumulator(config.tenantId, config.cameraId, config.config);
        }
        console.log(`[HeatmapRegistry] Registered camera ${config.cameraId} (enabled: ${config.enabled})`);
    }
    /**
     * Unregister camera
     */
    async unregisterCamera(tenantId, cameraId) {
        const key = this.getCameraKey(tenantId, cameraId);
        // Persist final state
        await this.persistCamera(tenantId, cameraId);
        // Remove accumulator
        this.accumulators.delete(key);
        this.cameraConfigs.delete(key);
        console.log(`[HeatmapRegistry] Unregistered camera ${cameraId}`);
    }
    /**
     * Enable camera heatmap
     */
    enableCamera(tenantId, cameraId) {
        const key = this.getCameraKey(tenantId, cameraId);
        const config = this.cameraConfigs.get(key);
        if (!config) {
            throw new Error(`Camera ${cameraId} not registered`);
        }
        config.enabled = true;
        this.createAccumulator(tenantId, cameraId, config.config);
        console.log(`[HeatmapRegistry] Enabled camera ${cameraId}`);
    }
    /**
     * Disable camera heatmap
     */
    async disableCamera(tenantId, cameraId) {
        const key = this.getCameraKey(tenantId, cameraId);
        const config = this.cameraConfigs.get(key);
        if (config) {
            config.enabled = false;
        }
        // Persist and remove accumulator
        await this.persistCamera(tenantId, cameraId);
        this.accumulators.delete(key);
        console.log(`[HeatmapRegistry] Disabled camera ${cameraId}`);
    }
    /**
     * Get accumulator for camera
     */
    getAccumulator(tenantId, cameraId) {
        const key = this.getCameraKey(tenantId, cameraId);
        return this.accumulators.get(key);
    }
    /**
     * Get all registered cameras
     */
    getCameras() {
        return Array.from(this.cameraConfigs.values());
    }
    /**
     * Get registry statistics
     */
    getStats() {
        const accumulatorStats = Array.from(this.accumulators.values()).map(acc => acc.getStats());
        return {
            registeredCameras: this.cameraConfigs.size,
            activeCameras: this.accumulators.size,
            totalSamples: accumulatorStats.reduce((sum, s) => sum + s.totalSamples, 0),
            totalTracks: accumulatorStats.reduce((sum, s) => sum + s.uniqueTracks, 0),
            totalBuckets: accumulatorStats.reduce((sum, s) => sum + s.buckets, 0),
            trackingBus: this.trackingBus.getMetrics(),
            storage: this.store.getStats(),
        };
    }
    /**
     * Manually trigger persistence for all cameras
     */
    async persistAll() {
        const cameras = Array.from(this.cameraConfigs.values());
        await Promise.all(cameras.map(camera => this.persistCamera(camera.tenantId, camera.cameraId)));
    }
    // --- Private methods ---
    /**
     * Handle tracking observation
     */
    handleObservation(observation) {
        const key = this.getCameraKey(observation.tenantId, observation.cameraId);
        // Check if camera is registered and enabled
        const config = this.cameraConfigs.get(key);
        if (!config || !config.enabled) {
            return;
        }
        // Get or create accumulator
        let accumulator = this.accumulators.get(key);
        if (!accumulator) {
            accumulator = this.createAccumulator(observation.tenantId, observation.cameraId, config.config);
        }
        // Ingest observation
        accumulator.ingest(observation);
    }
    /**
     * Create accumulator for camera
     */
    createAccumulator(tenantId, cameraId, config) {
        const key = this.getCameraKey(tenantId, cameraId);
        const accumulator = new HeatmapAccumulator(tenantId, cameraId, config);
        this.accumulators.set(key, accumulator);
        return accumulator;
    }
    /**
     * Persist camera heatmap buckets
     */
    async persistCamera(tenantId, cameraId) {
        const key = this.getCameraKey(tenantId, cameraId);
        const accumulator = this.accumulators.get(key);
        if (!accumulator) {
            return;
        }
        // Get all buckets
        const timestamps = accumulator.getBucketTimestamps();
        const buckets = [];
        for (const timestamp of timestamps) {
            const bucket = accumulator.getBucket(timestamp);
            if (bucket) {
                buckets.push(bucket);
            }
        }
        // Persist to storage
        if (buckets.length > 0) {
            await this.store.storeBatch(buckets);
        }
        // Clear old buckets from memory (keep recent ones)
        const now = Date.now();
        const config = this.cameraConfigs.get(key);
        const retentionMs = config
            ? config.config.bucketSizeMs * config.config.maxMemoryBuckets
            : 3600000; // Default 1 hour
        const oldBuckets = accumulator.clearOldBuckets(now - retentionMs);
        if (oldBuckets.length > 0) {
            console.log(`[HeatmapRegistry] Cleared ${oldBuckets.length} old buckets for ${cameraId}`);
        }
    }
    /**
     * Start periodic persistence
     */
    startPersistence() {
        this.persistTimer = setInterval(async () => {
            try {
                await this.persistAll();
                await this.store.flush();
            }
            catch (error) {
                console.error('[HeatmapRegistry] Persistence error:', error);
            }
        }, this.config.persistIntervalMs);
    }
    /**
     * Start periodic cleanup
     */
    startCleanup() {
        this.cleanupTimer = setInterval(() => {
            try {
                for (const accumulator of this.accumulators.values()) {
                    accumulator.cleanupTrackStates();
                }
            }
            catch (error) {
                console.error('[HeatmapRegistry] Cleanup error:', error);
            }
        }, this.config.cleanupIntervalMs);
    }
    /**
     * Generate camera key
     */
    getCameraKey(tenantId, cameraId) {
        return `${tenantId}:${cameraId}`;
    }
}
/**
 * Create heatmap registry with default configuration
 */
export function createHeatmapRegistry(config) {
    return new HeatmapRegistry(config);
}
