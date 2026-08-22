import type { TwinSeverity } from "./types.js";

export interface DigitalTwinRealtimeEvent {
  id: string; tenantId: string; branchId: string; floorId?: string; type: string; occurredAt: string;
  severity?: TwinSeverity; objectId?: string; alertId?: string;
}

class DigitalTwinEventStream {
  private readonly listeners = new Set<{ tenantId: string; branchId?: string; floorId?: string; callback: (event: DigitalTwinRealtimeEvent) => void }>();
  publish(event: DigitalTwinRealtimeEvent) {
    for (const listener of this.listeners) {
      if (listener.tenantId !== event.tenantId) continue;
      if (listener.branchId && listener.branchId !== event.branchId) continue;
      if (listener.floorId && listener.floorId !== event.floorId) continue;
      listener.callback(event);
    }
  }
  subscribe(tenantId: string, callback: (event: DigitalTwinRealtimeEvent) => void, scope: { branchId?: string; floorId?: string } = {}) {
    const listener = { tenantId, callback, ...scope }; this.listeners.add(listener); return () => this.listeners.delete(listener);
  }
}
export const digitalTwinEvents = new DigitalTwinEventStream();
