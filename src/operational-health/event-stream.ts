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

  publish(event: OperationalHealthEvent) {
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

export const operationalHealthEvents = new OperationalHealthEventStream();
