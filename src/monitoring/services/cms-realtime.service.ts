/**
 * Central Monitoring Station Distributed Realtime Service
 * 
 * Uses distributed pub/sub to fan out alert events to connected operators
 * across all backend instances without tying state to a single process.
 */

import { unifiedEventBus, IEventBus } from "../../events/unified-event-bus.js";
import type { DurableAlert } from "../domain/monitoring-queue.types.js";

export interface RealtimeBroadcastPayload {
  type: "ALERT_CREATED" | "ALERT_QUEUED" | "ALERT_ASSIGNED" | "ALERT_ACKNOWLEDGED" | "ALERT_RESOLVED";
  tenantId: string;
  branchId: string;
  alertId: string;
  alert: Partial<DurableAlert>;
  timestamp: string;
}

export class CmsRealtimeService {
  private localListeners: Set<(payload: RealtimeBroadcastPayload) => void> = new Set();

  constructor(private readonly eventBus: IEventBus = unifiedEventBus) {
    this.subscribeDistributedEvents();
  }

  private async subscribeDistributedEvents() {
    await this.eventBus.subscribe("cms:realtime:alerts", (payload: RealtimeBroadcastPayload) => {
      for (const listener of this.localListeners) {
        try {
          listener(payload);
        } catch {
          // Ignore subscriber errors
        }
      }
    });
  }

  async publishAlertChanged(type: RealtimeBroadcastPayload["type"], alert: DurableAlert): Promise<void> {
    const payload: RealtimeBroadcastPayload = {
      type,
      tenantId: alert.tenantId,
      branchId: alert.branchId,
      alertId: alert.id,
      alert,
      timestamp: new Date().toISOString(),
    };
    await this.eventBus.publish("cms:realtime:alerts", payload);
  }

  subscribeLocal(listener: (payload: RealtimeBroadcastPayload) => void): () => void {
    this.localListeners.add(listener);
    return () => {
      this.localListeners.delete(listener);
    };
  }
}

export const cmsRealtimeService = new CmsRealtimeService();
