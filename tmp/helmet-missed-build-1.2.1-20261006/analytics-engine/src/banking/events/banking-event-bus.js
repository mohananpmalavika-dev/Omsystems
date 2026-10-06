/**
 * Banking Event Bus
 *
 * Central pub/sub infrastructure for banking observations.
 * Detectors publish normalized events; workflows consume them.
 */
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
/**
 * Banking Event Bus
 *
 * Provides:
 * - Event publishing from detectors
 * - Event subscription for workflows
 * - Deduplication based on eventId
 * - Optional event persistence
 */
export class BankingEventBus extends EventEmitter {
    processedEvents = new Map(); // eventId -> timestamp
    config;
    cleanupInterval = null;
    constructor(config = {}) {
        super();
        this.config = {
            persistEvents: config.persistEvents ?? false,
            deduplicationWindowMs: config.deduplicationWindowMs ?? 60_000, // 1 minute
            maxListeners: config.maxListeners ?? 50,
        };
        this.setMaxListeners(this.config.maxListeners);
        // Start cleanup of old processed events
        this.startCleanup();
    }
    /**
     * Publish a banking observation event
     */
    async publish(event, sourceService = 'unknown') {
        // Check for duplicate
        if (this.isDuplicate(event.eventId)) {
            return;
        }
        const metadata = {
            eventId: event.eventId,
            sourceService,
            receivedAt: new Date(),
            processed: false,
        };
        // Mark as received
        this.markProcessed(event.eventId);
        // Emit to subscribers
        this.emit(event.type, event, metadata);
        this.emit('*', event, metadata); // Wildcard listener
        // Persist if configured
        if (this.config.persistEvents) {
            await this.persistEvent(event, metadata);
        }
    }
    /**
     * Subscribe to specific event types
     */
    subscribe(eventType, handler) {
        const types = Array.isArray(eventType) ? eventType : [eventType];
        for (const type of types) {
            this.on(type, handler);
        }
    }
    /**
     * Subscribe to all events
     */
    subscribeAll(handler) {
        this.on('*', handler);
    }
    /**
     * Unsubscribe from event types
     */
    unsubscribe(eventType, handler) {
        const types = Array.isArray(eventType) ? eventType : [eventType];
        for (const type of types) {
            this.off(type, handler);
        }
    }
    /**
     * Check if event was recently processed (deduplication)
     */
    isDuplicate(eventId) {
        const processed = this.processedEvents.get(eventId);
        if (!processed) {
            return false;
        }
        const age = Date.now() - processed;
        return age < this.config.deduplicationWindowMs;
    }
    /**
     * Mark event as processed
     */
    markProcessed(eventId) {
        this.processedEvents.set(eventId, Date.now());
    }
    /**
     * Start cleanup interval for old processed events
     */
    startCleanup() {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            const cutoff = now - this.config.deduplicationWindowMs;
            for (const [eventId, timestamp] of this.processedEvents.entries()) {
                if (timestamp < cutoff) {
                    this.processedEvents.delete(eventId);
                }
            }
        }, this.config.deduplicationWindowMs);
    }
    /**
     * Stop the event bus and cleanup
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.removeAllListeners();
        this.processedEvents.clear();
    }
    /**
     * Persist event (override in subclass for actual persistence)
     */
    async persistEvent(event, metadata) {
        // Override in repository-backed implementation
        // For now, this is a no-op
    }
    /**
     * Get statistics about the event bus
     */
    getStats() {
        return {
            processedEventsCount: this.processedEvents.size,
            listenerCount: this.eventNames().reduce((sum, name) => sum + this.listenerCount(name), 0),
            eventTypes: this.eventNames(),
        };
    }
}
/**
 * Singleton instance (can be replaced with DI in production)
 */
let globalBus = null;
export function getBankingEventBus() {
    if (!globalBus) {
        globalBus = new BankingEventBus({
            persistEvents: true,
            deduplicationWindowMs: 60_000,
        });
    }
    return globalBus;
}
export function setBankingEventBus(bus) {
    globalBus = bus;
}
/**
 * Helper to generate event IDs
 */
export function generateEventId(prefix = 'evt') {
    return `${prefix}_${uuidv4().replace(/-/g, '')}`;
}
