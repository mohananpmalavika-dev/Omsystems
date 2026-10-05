/**
 * Unified Event Bus
 * Provides a single abstraction layer for both in-memory and distributed (Redis) event buses
 * Enables seamless switching via environment variable
 */
import { EventEmitter } from 'events';
/**
 * In-Memory Event Bus (single instance only)
 */
export class InMemoryEventBus extends EventEmitter {
    async publish(event, data) {
        this.emit(event, data);
    }
    async subscribe(event, handler) {
        this.on(event, handler);
        return () => {
            this.off(event, handler);
        };
    }
    async subscribePattern(pattern, handler) {
        // In-memory doesn't support true patterns, so we subscribe to exact matches
        // This is a limitation of the in-memory implementation
        this.on(pattern, (data) => handler(pattern, data));
    }
    async unsubscribe(event) {
        this.removeAllListeners(event);
    }
    async healthCheck() {
        return true; // In-memory is always healthy
    }
    async disconnect() {
        this.removeAllListeners();
    }
}
/**
 * Redis Distributed Event Bus Wrapper
 */
export class RedisEventBusWrapper {
    distributedBus;
    constructor(distributedBus) {
        this.distributedBus = distributedBus;
    }
    async publish(event, data) {
        await this.distributedBus.publish(event, data);
    }
    async subscribe(event, handler) {
        await this.distributedBus.subscribe(event, handler);
        return async () => {
            await this.distributedBus.unsubscribe(event);
        };
    }
    async subscribePattern(pattern, handler) {
        await this.distributedBus.subscribePattern(pattern, handler);
    }
    async unsubscribe(event) {
        await this.distributedBus.unsubscribe(event);
    }
    async healthCheck() {
        return await this.distributedBus.healthCheck();
    }
    async disconnect() {
        await this.distributedBus.disconnect();
    }
}
/**
 * Event Bus Factory
 * Creates the appropriate event bus based on configuration
 */
export class EventBusFactory {
    static instance = null;
    static mode = null;
    /**
     * Initialize event bus
     */
    static async initialize(config) {
        if (this.instance) {
            return this.instance;
        }
        // Determine mode from config or environment
        const mode = config?.mode || process.env.EVENT_BUS_MODE || 'memory';
        this.mode = mode;
        console.log(`[EventBusFactory] Initializing ${this.mode} event bus`);
        if (this.mode === 'redis') {
            try {
                // Initialize Redis-based distributed event bus
                const redisConfig = {
                    redis: {
                        host: config?.redis?.host || process.env.REDIS_HOST || 'localhost',
                        port: config?.redis?.port || parseInt(process.env.REDIS_PORT || '6379', 10),
                        password: config?.redis?.password || process.env.REDIS_PASSWORD,
                        db: config?.redis?.db || parseInt(process.env.REDIS_DB || '0', 10),
                        url: config?.redis?.url || process.env.REDIS_URL,
                    },
                    namespace: config?.namespace || process.env.EVENT_BUS_NAMESPACE || 'sentinel',
                };
                const { initializeDistributedEventBus } = await import('./distributed-event-bus.service.js');
                const distributedBus = initializeDistributedEventBus(redisConfig);
                await distributedBus.connect();
                this.instance = new RedisEventBusWrapper(distributedBus);
                console.log('[EventBusFactory] Redis event bus initialized and connected');
            }
            catch (error) {
                if (process.env.NODE_ENV === 'production') {
                    throw new Error(`EVENT_BUS_UNAVAILABLE: Failed to connect to Redis event bus in production: ${error instanceof Error ? error.message : error}`);
                }
                console.error('[EventBusFactory] Failed to connect to Redis event bus, falling back to in-memory mode:', error instanceof Error ? error.message : error);
                this.mode = 'memory';
                this.instance = new InMemoryEventBus();
                console.log('[EventBusFactory] In-memory event bus fallback initialized');
            }
        }
        else {
            // In-memory event bus
            this.instance = new InMemoryEventBus();
            console.log('[EventBusFactory] In-memory event bus initialized');
            console.warn('[EventBusFactory] WARNING: In-memory mode does not support multi-instance deployments');
        }
        return this.instance;
    }
    /**
     * Get initialized event bus instance
     */
    static getInstance() {
        if (!this.instance) {
            throw new Error('EventBus not initialized. Call EventBusFactory.initialize() first.');
        }
        return this.instance;
    }
    /**
     * Get current mode
     */
    static getMode() {
        return this.mode;
    }
    /**
     * Reset (for testing)
     */
    static async reset() {
        if (this.instance) {
            await this.instance.disconnect();
            this.instance = null;
            this.mode = null;
        }
    }
    /**
     * Check if Redis mode is active
     */
    static isDistributed() {
        return this.mode === 'redis';
    }
}
/**
 * Convenience function to get event bus
 */
export async function getEventBus() {
    try {
        return EventBusFactory.getInstance();
    }
    catch {
        // Auto-initialize with defaults if not initialized
        return await EventBusFactory.initialize();
    }
}
/**
 * Type-safe event publishing helper
 */
export async function publishEvent(event, data) {
    const bus = await getEventBus();
    await bus.publish(event, data);
}
/**
 * Type-safe event subscription helper
 */
export async function subscribeToEvent(event, handler) {
    const bus = await getEventBus();
    return await bus.subscribe(event, handler);
}
/**
 * Health check helper
 */
export async function checkEventBusHealth() {
    try {
        const bus = EventBusFactory.getInstance();
        const healthy = await bus.healthCheck();
        const mode = EventBusFactory.getMode() || 'unknown';
        return {
            healthy,
            mode,
            message: healthy
                ? `Event bus (${mode}) is healthy`
                : `Event bus (${mode}) is unhealthy`,
        };
    }
    catch (error) {
        return {
            healthy: false,
            mode: 'unknown',
            message: error instanceof Error ? error.message : 'Event bus not initialized',
        };
    }
}
export const unifiedEventBus = new InMemoryEventBus();
