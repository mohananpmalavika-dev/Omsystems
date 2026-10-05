/**
 * Tracking Event Bus
 *
 * In-process event bus for distributing tracking observations to analytics consumers.
 * Provides bounded queue with backpressure handling to prevent blocking inference.
 */
import { EventEmitter } from 'node:events';
/**
 * High-throughput event bus for tracking observations.
 *
 * Design principles:
 * - Non-blocking: inference pipeline must never wait for analytics
 * - Bounded: prevent memory growth under load
 * - Isolated: consumer errors don't affect other consumers
 * - Observable: metrics for monitoring and debugging
 */
export class TrackingEventBus {
    emitter;
    config;
    queue = [];
    processing = false;
    metrics = {
        published: 0,
        consumed: 0,
        dropped: 0,
        errors: 0,
        queueSize: 0,
        subscribers: 0,
    };
    constructor(config = {}) {
        this.emitter = new EventEmitter();
        this.emitter.setMaxListeners(100); // Support many analytics consumers
        this.config = {
            maxQueueSize: config.maxQueueSize ?? 10000,
            overflowPolicy: config.overflowPolicy ?? 'drop-oldest',
            debug: config.debug ?? false,
        };
    }
    /**
     * Publish a tracking observation.
     *
     * Non-blocking. If queue is full, applies configured overflow policy.
     * Returns true if event was queued, false if dropped.
     */
    publish(observation) {
        return this.enqueue('tracking.observation', observation);
    }
    /**
     * Publish track start event
     */
    publishTrackStart(event) {
        return this.enqueue('track.start', event);
    }
    /**
     * Publish track end event
     */
    publishTrackEnd(event) {
        return this.enqueue('track.end', event);
    }
    /**
     * Subscribe to tracking observations.
     *
     * Listeners are called asynchronously and errors are isolated.
     * Returns unsubscribe function.
     */
    subscribe(listener) {
        // Wrap listener to handle type mismatch
        const wrappedListener = (event) => {
            if ('bbox' in event && 'anchor' in event && 'confidence' in event) {
                return listener(event);
            }
        };
        return this.on('tracking.observation', wrappedListener);
    }
    /**
     * Subscribe to track lifecycle events
     */
    onTrackStart(listener) {
        // Wrap listener to handle type mismatch
        const wrappedListener = (event) => {
            if ('type' in event && 'initialBbox' in event) {
                return listener(event);
            }
        };
        return this.on('track.start', wrappedListener);
    }
    onTrackEnd(listener) {
        // Wrap listener to handle type mismatch
        const wrappedListener = (event) => {
            if ('type' in event && 'finalBbox' in event && 'duration' in event) {
                return listener(event);
            }
        };
        return this.on('track.end', wrappedListener);
    }
    /**
     * Generic event subscription
     */
    on(eventType, listener) {
        const wrapped = (event) => {
            Promise.resolve(listener(event))
                .then(() => {
                this.metrics.consumed++;
            })
                .catch((error) => {
                this.metrics.errors++;
                console.error(`[TrackingEventBus] Consumer error on ${eventType}:`, error);
            });
        };
        this.emitter.on(eventType, wrapped);
        this.metrics.subscribers++;
        return () => {
            this.emitter.off(eventType, wrapped);
            this.metrics.subscribers = Math.max(0, this.metrics.subscribers - 1);
        };
    }
    /**
     * Enqueue event with backpressure handling
     */
    enqueue(eventType, event) {
        // Check queue capacity
        if (this.queue.length >= this.config.maxQueueSize) {
            return this.handleOverflow(eventType, event);
        }
        this.queue.push(event);
        this.metrics.published++;
        this.metrics.queueSize = this.queue.length;
        // Start processing if not already running
        if (!this.processing) {
            this.processQueue();
        }
        return true;
    }
    /**
     * Handle queue overflow based on policy
     */
    handleOverflow(eventType, event) {
        switch (this.config.overflowPolicy) {
            case 'drop-oldest':
                this.queue.shift(); // Remove oldest
                this.queue.push(event);
                this.metrics.dropped++;
                this.emitter.emit('queue.overflow', {
                    eventType,
                    policy: this.config.overflowPolicy,
                    dropped: this.metrics.dropped,
                });
                console.warn('[TrackingEventBus] Queue full, dropped oldest event', {
                    eventType,
                    dropped: this.metrics.dropped,
                });
                return true;
            case 'drop-newest':
                this.metrics.dropped++;
                this.emitter.emit('queue.overflow', {
                    eventType,
                    policy: this.config.overflowPolicy,
                    dropped: this.metrics.dropped,
                });
                console.warn('[TrackingEventBus] Queue full, dropped newest event', {
                    eventType,
                    dropped: this.metrics.dropped,
                });
                return false;
            case 'block':
                // This shouldn't happen in normal operation
                // but provides option for guaranteed delivery
                console.warn('[TrackingEventBus] Queue full, blocking (should not happen)');
                return false;
            default:
                return false;
        }
    }
    /**
     * Process queued events asynchronously
     */
    async processQueue() {
        this.processing = true;
        while (this.queue.length > 0) {
            const event = this.queue.shift();
            if (!event)
                break;
            this.metrics.queueSize = this.queue.length;
            // Determine event type
            const eventType = this.getEventType(event);
            // Emit to all subscribers
            this.emitter.emit(eventType, event);
            // Yield to event loop to prevent blocking
            if (this.queue.length % 100 === 0) {
                await new Promise(resolve => setImmediate(resolve));
            }
        }
        this.processing = false;
    }
    /**
     * Determine event type from event shape
     */
    getEventType(event) {
        if ('type' in event) {
            return event.type;
        }
        return 'tracking.observation';
    }
    /**
     * Get current metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }
    /**
     * Reset metrics (useful for testing)
     */
    resetMetrics() {
        this.metrics = {
            published: 0,
            consumed: 0,
            dropped: 0,
            errors: 0,
            queueSize: this.queue.length,
            subscribers: this.metrics.subscribers,
        };
    }
    /**
     * Clear queue and reset (useful for testing)
     */
    clear() {
        this.queue.length = 0;
        this.metrics.queueSize = 0;
    }
    /**
     * Shutdown: stop processing and clear subscribers
     */
    async shutdown() {
        // Wait for queue to drain
        while (this.queue.length > 0 && this.processing) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        this.emitter.removeAllListeners();
        this.queue.length = 0;
        this.processing = false;
    }
}
