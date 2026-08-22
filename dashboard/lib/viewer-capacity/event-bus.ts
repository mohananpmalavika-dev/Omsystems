/**
 * Viewer Capacity Event Bus
 * 
 * Enables immediate decoupled signaling for priority promotions (P1 alarms),
 * operator selections, viewport changes, and pressure triggers.
 */

import type { CapacityPressure, StreamPriority } from "./types.js";

export type ViewerEventMap = {
  "camera.alert.critical": { cameraId: string; branchId: string; alertId?: string };
  "camera.alert.high": { cameraId: string; branchId: string; alertId?: string };
  "camera.selected": { cameraId: string };
  "camera.pinned": { cameraId: string; pinned: boolean };
  "camera.promote": { cameraId: string; priority: StreamPriority };
  "pressure.changed": { previous: CapacityPressure; current: CapacityPressure };
  "rebalance.needed": { reason: string };
};

export type ViewerEventListener<T> = (data: T) => void | Promise<void>;

export class ViewerEventBus {
  private listeners = new Map<keyof ViewerEventMap, Set<ViewerEventListener<any>>>();

  on<K extends keyof ViewerEventMap>(event: K, listener: ViewerEventListener<ViewerEventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  emit<K extends keyof ViewerEventMap>(event: K, data: ViewerEventMap[K]): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        handler(data);
      } catch (err) {
        console.error(`Error in event handler for "${event}":`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
