/**
 * Heatmap System Integration
 * 
 * Wires together the complete heatmap system with the analytics pipeline.
 */

import { TrackingEventBus } from '../tracking.js';
import { HeatmapStore } from './heatmap-store.js';
import { HeatmapService } from './heatmap-service.js';
import { HeatmapRenderer } from './heatmap-renderer.js';
import { HeatmapRegistry, CameraHeatmapConfig } from './heatmap-registry.js';
import { DEFAULT_HEATMAP_CONFIG, HeatmapConfig } from './heatmap-types.js';
import type { PersonDetector } from '../detectors/person-detector.js';
import type { VehicleDetector } from '../detectors/vehicle-detector.js';

export interface HeatmapSystemConfig {
    /** Enable heatmap system */
    enabled?: boolean;

    /** Default heatmap configuration */
    defaultConfig?: Partial<HeatmapConfig>;

    /** Storage backend */
    storageBackend?: 'memory' | 'database' | 'file';

    /** Auto-persistence interval (milliseconds) */
    persistIntervalMs?: number;

    /** Pre-registered cameras */
    cameras?: Array<{
        tenantId: string;
        cameraId: string;
        config?: Partial<HeatmapConfig>;
        enabled?: boolean;
    }>;
}

/**
 * Complete heatmap system
 */
export class HeatmapSystem {
    private readonly trackingBus: TrackingEventBus;
    private readonly store: HeatmapStore;
    private readonly service: HeatmapService;
    private readonly renderer: HeatmapRenderer;
    private readonly registry: HeatmapRegistry;

    private started = false;

    constructor(config: HeatmapSystemConfig = {}) {
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
    start(): void {
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
    async stop(): Promise<void> {
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
    connectDetectors(personDetector: PersonDetector, vehicleDetector: VehicleDetector): void {
        personDetector.setTrackingBus(this.trackingBus);
        vehicleDetector.setTrackingBus(this.trackingBus);

        console.log('[HeatmapSystem] Connected detectors to tracking bus');
    }

    /**
     * Get tracking event bus
     */
    getTrackingBus(): TrackingEventBus {
        return this.trackingBus;
    }

    /**
     * Get heatmap service
     */
    getService(): HeatmapService {
        return this.service;
    }

    /**
     * Get heatmap renderer
     */
    getRenderer(): HeatmapRenderer {
        return this.renderer;
    }

    /**
     * Get heatmap registry
     */
    getRegistry(): HeatmapRegistry {
        return this.registry;
    }

    /**
     * Get heatmap store
     */
    getStore(): HeatmapStore {
        return this.store;
    }

    /**
     * Register camera for heatmap tracking
     */
    registerCamera(config: CameraHeatmapConfig): void {
        this.registry.registerCamera(config);
    }

    /**
     * Unregister camera
     */
    async unregisterCamera(tenantId: string, cameraId: string): Promise<void> {
        await this.registry.unregisterCamera(tenantId, cameraId);
    }

    /**
     * Enable camera heatmap
     */
    enableCamera(tenantId: string, cameraId: string): void {
        this.registry.enableCamera(tenantId, cameraId);
    }

    /**
     * Disable camera heatmap
     */
    async disableCamera(tenantId: string, cameraId: string): Promise<void> {
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
            status: this.started ? ('healthy' as const) : ('unhealthy' as const),
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
export async function createHeatmapSystem(
    config: HeatmapSystemConfig = {},
): Promise<HeatmapSystem> {
    const system = new HeatmapSystem(config);

    if (config.enabled !== false) {
        system.start();
    }

    return system;
}
