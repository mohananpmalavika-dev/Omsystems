import type { EdgeStateChangeEvent } from "../domain/edge-protocol.types.js";
import { EdgeGatewayManagerService } from "./edge-gateway-manager.service.js";

export class EdgeStoreAndForwardQueue {
  private localQueue: EdgeStateChangeEvent[] = [];
  private currentSequence = 0;
  private isConnected = true;

  constructor(
    public readonly edgeId: string,
    public readonly branchId: string,
    private readonly manager: EdgeGatewayManagerService,
  ) {}

  setConnectivity(connected: boolean) {
    this.isConnected = connected;
  }

  enqueueEvent(params: {
    entityType: "CAMERA" | "RECORDER" | "STORAGE" | "INTERNET" | "CLOCK" | "EDGE";
    entityId: string;
    previousState: string;
    newState: string;
    reason?: string | undefined;
    payload?: Record<string, unknown> | undefined;
  }): EdgeStateChangeEvent {
    this.currentSequence++;
    const evt: EdgeStateChangeEvent = {
      eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sequenceNumber: this.currentSequence,
      edgeId: this.edgeId,
      branchId: this.branchId,
      entityType: params.entityType,
      entityId: params.entityId,
      previousState: params.previousState,
      newState: params.newState,
      reason: params.reason,
      observedAt: new Date(),
      payload: params.payload,
    };

    this.localQueue.push(evt);
    return evt;
  }

  getPendingQueueLength(): number {
    return this.localQueue.length;
  }

  async flush(): Promise<{ flushedCount: number; remainingCount: number }> {
    if (!this.isConnected || this.localQueue.length === 0) {
      return { flushedCount: 0, remainingCount: this.localQueue.length };
    }

    const batch = [...this.localQueue];
    const res = await this.manager.ingestEventBatch(batch);

    // Remove successfully flushed items
    this.localQueue = this.localQueue.slice(res.ingestedCount + res.duplicateCount);

    return {
      flushedCount: res.ingestedCount + res.duplicateCount,
      remainingCount: this.localQueue.length,
    };
  }
}
