/**
 * Capability Event Bus
 * 
 * Manages capability change events and distributes them to subscribers.
 */

import { EventEmitter } from "node:events";
import type {
  DeviceCapabilityChanged,
  CapabilityDriftEvent,
  CapabilityDriftType,
  CapabilityKey,
  CapabilityState,
} from "../capability.types.js";

/**
 * Capability event types.
 */
export type CapabilityEventType =
  | "capability.changed"
  | "capability.drift"
  | "capability.added"
  | "capability.removed"
  | "capability.unavailable"
  | "capability.recovered"
  | "capability.degraded"
  | "capability.verified";

/**
 * Base capability event.
 */
export interface CapabilityEvent {
  type: CapabilityEventType;
  tenantId: string;
  deviceId: string;
  capability: CapabilityKey;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Capability event handler.
 */
export type CapabilityEventHandler = (event: CapabilityEvent) => void | Promise<void>;

/**
 * Event subscription.
 */
interface EventSubscription {
  id: string;
  eventType: CapabilityEventType | "*";
  handler: CapabilityEventHandler;
  tenantId?: string;
  deviceId?: string;
}

/**
 * Capability event bus.
 */
export class CapabilityEventBus {
  private readonly emitter = new EventEmitter();
  private readonly subscriptions = new Map<string, EventSubscription>();
  private subscriptionIdCounter = 0;

  constructor() {
    // Set higher limit for listeners
    this.emitter.setMaxListeners(100);
  }

  /**
   * Subscribe to capability events.
   */
  subscribe(
    eventType: CapabilityEventType | "*",
    handler: CapabilityEventHandler,
    filters?: {
      tenantId?: string;
      deviceId?: string;
    },
  ): () => void {
    const subscriptionId = `sub-${++this.subscriptionIdCounter}`;

    const subscription: EventSubscription = {
      id: subscriptionId,
      eventType,
      handler,
      tenantId: filters?.tenantId,
      deviceId: filters?.deviceId,
    };

    this.subscriptions.set(subscriptionId, subscription);

    // Return unsubscribe function
    return () => {
      this.subscriptions.delete(subscriptionId);
    };
  }

  /**
   * Publish a capability event.
   */
  async publish(event: CapabilityEvent): Promise<void> {
    // Get matching subscriptions
    const matching = Array.from(this.subscriptions.values()).filter((sub) => {
      // Check event type
      if (sub.eventType !== "*" && sub.eventType !== event.type) {
        return false;
      }

      // Check tenant filter
      if (sub.tenantId && sub.tenantId !== event.tenantId) {
        return false;
      }

      // Check device filter
      if (sub.deviceId && sub.deviceId !== event.deviceId) {
        return false;
      }

      return true;
    });

    // Call handlers
    await Promise.all(
      matching.map(async (sub) => {
        try {
          await sub.handler(event);
        } catch (error) {
          console.error(
            `Error in capability event handler ${sub.id}:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }),
    );

    // Also emit on EventEmitter for backwards compatibility
    this.emitter.emit(event.type, event);
  }

  /**
   * Publish a capability changed event.
   */
  async publishCapabilityChanged(change: DeviceCapabilityChanged): Promise<void> {
    const event: CapabilityEvent = {
      type: "capability.changed",
      tenantId: change.tenantId,
      deviceId: change.deviceId,
      capability: change.capability,
      timestamp: change.observedAt,
      metadata: {
        previousState: change.previousState,
        newState: change.newState,
        previousAvailable: change.previousAvailable,
        newAvailable: change.newAvailable,
        reason: change.reason,
        evidenceCount: change.evidence.length,
      },
    };

    await this.publish(event);
  }

  /**
   * Publish a capability drift event.
   */
  async publishCapabilityDrift(drift: CapabilityDriftEvent): Promise<void> {
    const eventTypeMap: Record<CapabilityDriftType, CapabilityEventType> = {
      CAPABILITY_ADDED: "capability.added",
      CAPABILITY_REMOVED: "capability.removed",
      CAPABILITY_UNAVAILABLE: "capability.unavailable",
      CAPABILITY_RECOVERED: "capability.recovered",
      CAPABILITY_DEGRADED: "capability.degraded",
      CAPABILITY_CONFIGURATION_CHANGED: "capability.changed",
    };

    const event: CapabilityEvent = {
      type: eventTypeMap[drift.driftType],
      tenantId: drift.tenantId,
      deviceId: drift.deviceId,
      capability: drift.capability,
      timestamp: drift.detectedAt,
      metadata: {
        driftType: drift.driftType,
        previousValue: drift.previousValue,
        newValue: drift.newValue,
        probableCause: drift.probableCause,
      },
    };

    await this.publish(event);
  }

  /**
   * Get event statistics.
   */
  getStatistics(): {
    subscriptionCount: number;
    subscriptionsByType: Record<string, number>;
  } {
    const subscriptionsByType: Record<string, number> = {};

    for (const sub of this.subscriptions.values()) {
      const type = sub.eventType;
      subscriptionsByType[type] = (subscriptionsByType[type] || 0) + 1;
    }

    return {
      subscriptionCount: this.subscriptions.size,
      subscriptionsByType,
    };
  }

  /**
   * Clear all subscriptions (for testing).
   */
  clearSubscriptions(): void {
    this.subscriptions.clear();
  }
}

/**
 * Global capability event bus instance.
 */
export const capabilityEvents = new CapabilityEventBus();
