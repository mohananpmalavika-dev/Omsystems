/**
 * Banking Event Bus
 * 
 * Central pub/sub infrastructure for banking observations.
 * Detectors publish normalized events; workflows consume them.
 */

import { EventEmitter } from 'events';
import { BankingObservation, EventMetadata } from './banking-events.js';
import { v4 as uuidv4 } from 'uuid';

export type BankingEventHandler = (event: BankingObservation, metadata: EventMetadata) => Promise<void> | void;

/**
 * Event bus configuration
 */
export interface BankingEventBusConfig {
  persistEvents?: boolean;
  deduplicationWindowMs?: number;
  maxListeners?: number;
}

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
  private processedEvents = new Map<string, number>(); // eventId -> timestamp
  private config: Required<BankingEventBusConfig>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: BankingEventBusConfig = {}) {
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
  async publish(event: BankingObservation, sourceService: string = 'unknown'): Promise<void> {
    // Check for duplicate
    if (this.isDuplicate(event.eventId)) {
      return;
    }

    const metadata: EventMetadata = {
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
  subscribe(eventType: string | string[], handler: BankingEventHandler): void {
    const types = Array.isArray(eventType) ? eventType : [eventType];

    for (const type of types) {
      this.on(type, handler);
    }
  }

  /**
   * Subscribe to all events
   */
  subscribeAll(handler: BankingEventHandler): void {
    this.on('*', handler);
  }

  /**
   * Unsubscribe from event types
   */
  unsubscribe(eventType: string | string[], handler: BankingEventHandler): void {
    const types = Array.isArray(eventType) ? eventType : [eventType];

    for (const type of types) {
      this.off(type, handler);
    }
  }

  /**
   * Check if event was recently processed (deduplication)
   */
  private isDuplicate(eventId: string): boolean {
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
  private markProcessed(eventId: string): void {
    this.processedEvents.set(eventId, Date.now());
  }

  /**
   * Start cleanup interval for old processed events
   */
  private startCleanup(): void {
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
  destroy(): void {
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
  protected async persistEvent(event: BankingObservation, metadata: EventMetadata): Promise<void> {
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
let globalBus: BankingEventBus | null = null;

export function getBankingEventBus(): BankingEventBus {
  if (!globalBus) {
    globalBus = new BankingEventBus({
      persistEvents: true,
      deduplicationWindowMs: 60_000,
    });
  }
  return globalBus;
}

export function setBankingEventBus(bus: BankingEventBus): void {
  globalBus = bus;
}

/**
 * Helper to generate event IDs
 */
export function generateEventId(prefix: string = 'evt'): string {
  return `${prefix}_${uuidv4().replace(/-/g, '')}`;
}
