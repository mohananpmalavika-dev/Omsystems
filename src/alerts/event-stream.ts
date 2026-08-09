import { getEventBus } from "../infrastructure/event-bus/event-bus.js";
import type { BaseEvent } from "../infrastructure/event-bus/event-types.js";
import type { AnalyticsAlert } from "../domain/models.js";

export interface AlertStreamEvent {
  id: string;
  tenantId: string;
  type: "alert.created" | "alert.updated" | "notification.updated";
  occurredAt: string;
  alertId: string;
  alert?: AnalyticsAlert;
}

type Listener = (event: AlertStreamEvent) => void;

export class AlertEventStream {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly localPublishedEventIds = new Set<string>();
  private remoteSubscriptionInitialized = false;

  publish(event: AlertStreamEvent) {
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

  private dispatchLocal(event: AlertStreamEvent) {
    for (const listener of this.listeners.get(event.tenantId) ?? []) {
      try {
        listener(event);
      } catch (error) {
        console.error("[AlertEventStream] Listener error:", error);
      }
    }
  }

  private async ensureRemoteSubscription() {
    if (this.remoteSubscriptionInitialized) return;
    this.remoteSubscriptionInitialized = true;

    try {
      const bus = getEventBus();
      await bus.subscribePattern("alert.*", async (message) => {
        const event = (message as unknown as BaseEvent).payload as AlertStreamEvent;
        if (this.localPublishedEventIds.has(event.id)) {
          this.localPublishedEventIds.delete(event.id);
          return;
        }
        this.dispatchLocal(event);
      });
    } catch (error) {
      console.error("[AlertEventStream] Failed to subscribe to remote alert events:", error);
    }
  }

  private async dispatchRemote(event: AlertStreamEvent) {
    try {
      const bus = getEventBus();
      this.localPublishedEventIds.add(event.id);
      setTimeout(() => this.localPublishedEventIds.delete(event.id), 60_000);
      await bus.publish(event.type, event, { tenantId: event.tenantId });
    } catch (error) {
      console.error("[AlertEventStream] Failed to publish remote alert event:", error);
    }
  }
}

export const alertEvents = new AlertEventStream();
