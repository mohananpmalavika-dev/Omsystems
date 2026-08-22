import { getEventBus } from "../infrastructure/event-bus/event-bus.js";
import type { BaseEvent } from "../infrastructure/event-bus/event-types.js";

export interface OperationalHealthEvent {
  id: string;
  tenantId: string;
  type: "health.updated" | "policy.updated";
  occurredAt: string;
  branchId?: string;
  deviceType?: string;
  deviceId?: string;
}

type Listener = (event: OperationalHealthEvent) => void;

export class OperationalHealthEventStream {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly localPublishedEventIds = new Set<string>();
  private remoteSubscriptionInitialized = false;

  publish(event: OperationalHealthEvent) {
    this.dispatchLocal(event);
    void this.dispatchRemote(event);
  }

  subscribe(tenantId: string, listener: Listener) {
    const listeners = this.listeners.get(tenantId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(tenantId, listeners);
    void this.ensureRemoteSubscription();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(tenantId);
    };
  }

  private dispatchLocal(event: OperationalHealthEvent) {
    for (const listener of this.listeners.get(event.tenantId) ?? []) {
      try {
        listener(event);
      } catch (error) {
        console.error("[OperationalHealthEventStream] Listener error:", error);
      }
    }
  }

  private async ensureRemoteSubscription() {
    if (this.remoteSubscriptionInitialized) return;
    this.remoteSubscriptionInitialized = true;

    try {
      const bus = getEventBus();
      await bus.subscribePattern("health.*", async (message) => {
        const event = (message as unknown as BaseEvent).payload as OperationalHealthEvent;
        if (this.localPublishedEventIds.has(event.id)) {
          this.localPublishedEventIds.delete(event.id);
          return;
        }
        this.dispatchLocal(event);
      });
    } catch (error) {
      console.error("[OperationalHealthEventStream] Failed to subscribe to remote health events:", error);
    }
  }

  private async dispatchRemote(event: OperationalHealthEvent) {
    try {
      const bus = getEventBus();
      this.localPublishedEventIds.add(event.id);
      setTimeout(() => this.localPublishedEventIds.delete(event.id), 60_000);
      await bus.publish(event.type, event, { tenantId: event.tenantId, branchId: event.branchId, deviceId: event.deviceId });
    } catch (error) {
      console.error("[OperationalHealthEventStream] Failed to publish remote health event:", error);
    }
  }
}

export const operationalHealthEvents = new OperationalHealthEventStream();
