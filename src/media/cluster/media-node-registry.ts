/** Runtime media-node registry populated by authenticated node heartbeats. */

import { randomUUID } from "node:crypto";
import type { MediaNodeInstance, MediaNodeStatus, FailureDomain, MediaNodeCapacity } from "./camera-lease.types.js";

export class MediaNodeRegistry {
  private readonly nodes = new Map<string, MediaNodeInstance>();
  private readonly heartbeatTtlMs = 15_000;

  registerNode(
    nodeId: string,
    nodeName: string,
    host: string,
    port: number,
    failureDomain: FailureDomain,
    capacity: MediaNodeCapacity,
    role: MediaNodeInstance["role"] = "PRIMARY_INGEST",
    version = "unknown",
  ): MediaNodeInstance {
    const now = Date.now();
    const instance: MediaNodeInstance = {
      nodeId,
      instanceId: randomUUID(),
      nodeName,
      host,
      port,
      version,
      role,
      status: "HEALTHY",
      failureDomain,
      capacity,
      lastHeartbeat: now,
      bootedAt: now,
    };
    this.nodes.set(nodeId, instance);
    return instance;
  }

  heartbeat(nodeId: string, instanceId: string, capacityUpdates?: Partial<MediaNodeCapacity>): boolean {
    const node = this.nodes.get(nodeId);
    if (!node || node.instanceId !== instanceId) return false;
    node.lastHeartbeat = Date.now();
    if (node.status === "OFFLINE") node.status = "HEALTHY";
    if (capacityUpdates) node.capacity = { ...node.capacity, ...capacityUpdates };
    return true;
  }

  getNode(nodeId: string): MediaNodeInstance | undefined {
    this.pruneStaleNodes();
    return this.nodes.get(nodeId);
  }

  listActiveNodes(): MediaNodeInstance[] {
    this.pruneStaleNodes();
    return Array.from(this.nodes.values()).filter((node) => node.status !== "OFFLINE");
  }

  listAllNodes(): MediaNodeInstance[] {
    this.pruneStaleNodes();
    return Array.from(this.nodes.values());
  }

  setNodeStatus(nodeId: string, status: MediaNodeStatus): void {
    const node = this.nodes.get(nodeId);
    if (node) node.status = status;
  }

  /** Test/operations hook; callers must be authenticated and authorized. */
  simulateNodeCrash(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.status = "OFFLINE";
      node.lastHeartbeat = Date.now() - this.heartbeatTtlMs - 5_000;
    }
  }

  private pruneStaleNodes() {
    const now = Date.now();
    for (const node of this.nodes.values()) {
      if (now - node.lastHeartbeat > this.heartbeatTtlMs && node.status !== "OFFLINE") node.status = "OFFLINE";
    }
  }
}

export const mediaNodeRegistry = new MediaNodeRegistry();
