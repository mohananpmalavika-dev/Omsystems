/**
 * Heatmap System Integration
 *
 * Wires together the complete heatmap system with the analytics pipeline.
 */
import { TrackingEventBus } from '../tracking.js';
import { HeatmapStore } from './heatmap-store.js';
import { HeatmapService } from './heatmap-service.js';
import { HeatmapRenderer } from './heatmap-renderer.js';
import { HeatmapRegistry } from './heatmap-registry.js';
import { DEFAULT_HEATMAP_CONFIG } from './heatmap-types.js';
/**
 * Complete heatmap system
 */
export class HeatmapSystem {
    trackingBus;
    store;
    service;
    renderer;
    registry;
    started = false;
    constructor(config = {}) {
        // Create tracking event bus
        this.trackingBus = new TrackingEventBus({
            maxQueueSize: 10000,
            overflowPolicy: 'drop-oldest',
        });
        // Create storage
        this.store = new HeatmapStore({
            backend: config.storageBackend || 'memory',
            autoPersistIntervalMs: config.persistIntervalMs || 60000,
        });
        // Create service
        this.service = new HeatmapService({
            store: this.store,
        });
        // Create renderer
        this.renderer = new HeatmapRenderer();
        // Create registry
        this.registry = new HeatmapRegistry({
            trackingBus: this.trackingBus,
            store: this.store,
            persistIntervalMs: config.persistIntervalMs,
            defaultConfig: config.defaultConfig,
        });
        // Register pre-configured cameras
        if (config.cameras) {
            for (const camera of config.cameras) {
                this.registry.registerCamera({
                    tenantId: camera.tenantId,
                    cameraId: camera.cameraId,
                    config: {
                        ...DEFAULT_HEATMAP_CONFIG,
                        ...config.defaultConfig,
                        ...camera.config,
                    },
                    enabled: camera.enabled ?? true,
                });
            }
        }
    }
    /**
     * Start heatmap system
     */
    start() {
        if (this.started) {
            return;
        }
        this.registry.start();
        this.started = true;
        console.log('[HeatmapSystem] Started');
    }
    /**
     * Stop heatmap system
     */
    async stop() {
        if (!this.started) {
            return;
        }
        await this.registry.stop();
        await this.store.shutdown();
        await this.trackingBus.shutdown();
        this.started = false;
        console.log('[HeatmapSystem] Stopped');
    }
    /**
     * Connect detectors to tracking bus
     */
    connectDetectors(personDetector, vehicleDetector) {
        personDetector.setTrackingBus(this.trackingBus);
        vehicleDetector.setTrackingBus(this.trackingBus);
        console.log('[HeatmapSystem] Connected detectors to tracking bus');
    }
    /**
     * Get tracking event bus
     */
    getTrackingBus() {
        return this.trackingBus;
    }
    /**
     * Get heatmap service
     */
    getService() {
        return this.service;
    }
    /**
     * Get heatmap renderer
     */
    getRenderer() {
        return this.renderer;
    }
    /**
     * Get heatmap registry
     */
    getRegistry() {
        return this.registry;
    }
    /**
     * Get heatmap store
     */
    getStore() {
        return this.store;
    }
    /**
     * Register camera for heatmap tracking
     */
    registerCamera(config) {
        this.registry.registerCamera(config);
    }
    /**
     * Unregister camera
     */
    async unregisterCamera(tenantId, cameraId) {
        await this.registry.unregisterCamera(tenantId, cameraId);
    }
    /**
     * Enable camera heatmap
     */
    enableCamera(tenantId, cameraId) {
        this.registry.enableCamera(tenantId, cameraId);
    }
    /**
     * Disable camera heatmap
     */
    async disableCamera(tenantId, cameraId) {
        await this.registry.disableCamera(tenantId, cameraId);
    }
    /**
     * Get system statistics
     */
    getStats() {
        return {
            started: this.started,
            registry: this.registry.getStats(),
            store: this.store.getStats(),
            trackingBus: this.trackingBus.getMetrics(),
        };
    }
    /**
     * Get health status
     */
    getHealth() {
        const stats = this.getStats();
        return {
            status: this.started ? 'healthy' : 'unhealthy',
            details: this.started
                ? `Heatmap system operational: ${stats.registry.activeCameras} active cameras, ${stats.registry.totalSamples} total samples`
                : 'Heatmap system not started',
            stats,
        };
    }
}
/**
 * Create and initialize heatmap system
 */
export async function createHeatmapSystem(config = {}) {
    const system = new HeatmapSystem(config);
    if (config.enabled !== false) {
        system.start();
    }
    return system;
}
