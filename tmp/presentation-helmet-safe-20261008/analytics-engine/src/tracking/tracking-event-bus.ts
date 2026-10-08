/**
 * Tracking Event Bus
 * 
 * In-process event bus for distributing tracking observations to analytics consumers.
 * Provides bounded queue with backpressure handling to prevent blocking inference.
 */

import { EventEmitter } from 'node:events';
import { TrackingObservation, TrackStartEvent, TrackEndEvent } from './tracking-observation.js';

export type TrackingEventType = 
    | 'tracking.observation'
    | 'track.start'
    | 'track.end';

export type TrackingEvent = TrackingObservation | TrackStartEvent | TrackEndEvent;

export interface TrackingEventBusConfig {
    /** Maximum queued events before applying backpressure */
    maxQueueSize?: number;

    /** Overflow policy when queue is full */
    overflowPolicy?: 'drop-oldest' | 'drop-newest' | 'block';

    /** Enable debug logging */
    debug?: boolean;
}

export interface TrackingEventBusMetrics {
    published: number;
    consumed: number;
    dropped: number;
    errors: number;
    queueSize: number;
    subscribers: number;
}

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
    private readonly emitter: EventEmitter;
    private readonly config: Required<TrackingEventBusConfig>;
    
    private readonly queue: TrackingEvent[] = [];
    private processing = false;

    private metrics: TrackingEventBusMetrics = {
        published: 0,
        consumed: 0,
        dropped: 0,
        errors: 0,
        queueSize: 0,
        subscribers: 0,
    };

    constructor(config: TrackingEventBusConfig = {}) {
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
    publish(observation: TrackingObservation): boolean {
        return this.enqueue('tracking.observation', observation);
    }

    /**
     * Publish track start event
     */
    publishTrackStart(event: TrackStartEvent): boolean {
        return this.enqueue('track.start', event);
    }

    /**
     * Publish track end event
     */
    publishTrackEnd(event: TrackEndEvent): boolean {
        return this.enqueue('track.end', event);
    }

    /**
     * Subscribe to tracking observations.
     * 
     * Listeners are called asynchronously and errors are isolated.
     * Returns unsubscribe function.
     */
    subscribe(
        listener: (observation: TrackingObservation) => void | Promise<void>,
    ): () => void {
        // Wrap listener to handle type mismatch
        const wrappedListener = (event: TrackingEvent) => {
            if ('bbox' in event && 'anchor' in event && 'confidence' in event) {
                return listener(event as TrackingObservation);
            }
        };
        return this.on('tracking.observation', wrappedListener);
    }

    /**
     * Subscribe to track lifecycle events
     */
    onTrackStart(
        listener: (event: TrackStartEvent) => void | Promise<void>,
    ): () => void {
        // Wrap listener to handle type mismatch
        const wrappedListener = (event: TrackingEvent) => {
            if ('type' in event && 'initialBbox' in event) {
                return listener(event as TrackStartEvent);
            }
        };
        return this.on('track.start', wrappedListener);
    }

    onTrackEnd(
        listener: (event: TrackEndEvent) => void | Promise<void>,
    ): () => void {
        // Wrap listener to handle type mismatch
        const wrappedListener = (event: TrackingEvent) => {
            if ('type' in event && 'finalBbox' in event && 'duration' in event) {
                return listener(event as TrackEndEvent);
            }
        };
        return this.on('track.end', wrappedListener);
    }

    /**
     * Generic event subscription
     */
    private on(
        eventType: TrackingEventType,
        listener: (event: TrackingEvent) => void | Promise<void>,
    ): () => void {
        const wrapped = (event: TrackingEvent) => {
            Promise.resolve(listener(event))
                .then(() => {
                    this.metrics.consumed++;
                })
                .catch((error) => {
                    this.metrics.errors++;
                    console.error(
                        `[TrackingEventBus] Consumer error on ${eventType}:`,
                        error,
                    );
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
    private enqueue(eventType: TrackingEventType, event: TrackingEvent): boolean {
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
    private handleOverflow(eventType: TrackingEventType, event: TrackingEvent): boolean {
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
    private async processQueue(): Promise<void> {
        this.processing = true;

        while (this.queue.length > 0) {
            const event = this.queue.shift();
            if (!event) break;

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
    private getEventType(event: TrackingEvent): TrackingEventType {
        if ('type' in event) {
            return event.type;
        }
        return 'tracking.observation';
    }

    /**
     * Get current metrics
     */
    getMetrics(): Readonly<TrackingEventBusMetrics> {
        return { ...this.metrics };
    }

    /**
     * Reset metrics (useful for testing)
     */
    resetMetrics(): void {
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
    clear(): void {
        this.queue.length = 0;
        this.metrics.queueSize = 0;
    }

    /**
     * Shutdown: stop processing and clear subscribers
     */
    async shutdown(): Promise<void> {
        // Wait for queue to drain
        while (this.queue.length > 0 && this.processing) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        this.emitter.removeAllListeners();
        this.queue.length = 0;
        this.processing = false;
    }
}
