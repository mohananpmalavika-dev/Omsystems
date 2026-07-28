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

  publish(event: AlertStreamEvent) {
    for (const listener of this.listeners.get(event.tenantId) ?? []) listener(event);
  }

  subscribe(tenantId: string, listener: Listener) {
    const listeners = this.listeners.get(tenantId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(tenantId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(tenantId);
    };
  }
}

export const alertEvents = new AlertEventStream();
