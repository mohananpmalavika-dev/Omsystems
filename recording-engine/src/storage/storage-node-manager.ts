import { EventEmitter } from "node:events";

export type StorageNodeHealthState =
  | "HEALTHY"
  | "DEGRADED"
  | "READ_ONLY"
  | "OFFLINE"
  | "FULL"
  | "RECOVERING";

export type StorageWatermarkLevel = "HEALTHY" | "WARNING" | "CRITICAL" | "EMERGENCY";

export interface ManagedStorageNode {
  nodeId: string;
  name: string;
  mountPath: string;
  capacityBytes: number;
  usedBytes: number;
  availableBytes: number;
  state: StorageNodeHealthState;
  watermark: StorageWatermarkLevel;
  isWritable: boolean;
  priority: number; // lower number = higher priority
  lastHealthCheckAt: Date;
}

export class StorageNodeManager extends EventEmitter {
  private nodes = new Map<string, ManagedStorageNode>();
  private protectedSegments = new Set<string>();

  registerNode(node: {
    nodeId: string;
    name: string;
    mountPath: string;
    capacityBytes: number;
    usedBytes?: number;
    availableBytes?: number;
    priority?: number;
  }): ManagedStorageNode {
    const usedBytes = node.usedBytes ?? 0;
    const capacityBytes = node.capacityBytes;
    const availableBytes = node.availableBytes ?? (capacityBytes - usedBytes);
    const watermark = this.calculateWatermark(capacityBytes, usedBytes);

    const managed: ManagedStorageNode = {
      nodeId: node.nodeId,
      name: node.name,
      mountPath: node.mountPath,
      capacityBytes,
      usedBytes,
      availableBytes,
      state: watermark === "EMERGENCY" ? "FULL" : "HEALTHY",
      watermark,
      isWritable: watermark !== "EMERGENCY",
      priority: node.priority ?? 1,
      lastHealthCheckAt: new Date(),
    };

    this.nodes.set(node.nodeId, managed);
    return managed;
  }

  updateNodeMetrics(
    nodeId: string,
    metrics: { capacityBytes: number; usedBytes: number; availableBytes: number; state?: StorageNodeHealthState },
  ): ManagedStorageNode | undefined {
    const node = this.nodes.get(nodeId);
    if (!node) return undefined;

    node.capacityBytes = metrics.capacityBytes;
    node.usedBytes = metrics.usedBytes;
    node.availableBytes = metrics.availableBytes;
    node.watermark = this.calculateWatermark(node.capacityBytes, node.usedBytes);
    node.lastHealthCheckAt = new Date();

    if (metrics.state) {
      node.state = metrics.state;
    } else if (node.watermark === "EMERGENCY") {
      node.state = "FULL";
    } else if (node.state === "FULL") {
      node.state = "HEALTHY";
    }

    node.isWritable = node.state === "HEALTHY" || node.state === "DEGRADED";
    return node;
  }

  /**
   * Selects the best healthy and writable storage node with failover support.
   */
  selectActiveNode(preferredNodeId?: string): ManagedStorageNode | undefined {
    if (preferredNodeId) {
      const preferred = this.nodes.get(preferredNodeId);
      if (preferred && preferred.isWritable && preferred.state !== "OFFLINE" && preferred.state !== "FULL") {
        return preferred;
      }
    }

    // Failover: Find highest priority available node
    const candidateNodes = [...this.nodes.values()]
      .filter((n) => n.isWritable && n.state !== "OFFLINE" && n.state !== "FULL" && n.availableBytes > 0)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return b.availableBytes - a.availableBytes;
      });

    return candidateNodes[0];
  }

  calculateWatermark(capacityBytes: number, usedBytes: number): StorageWatermarkLevel {
    if (capacityBytes <= 0) return "HEALTHY";
    const usedPercent = (usedBytes / capacityBytes) * 100;
    if (usedPercent >= 95) return "EMERGENCY";
    if (usedPercent >= 90) return "CRITICAL";
    if (usedPercent >= 80) return "WARNING";
    return "HEALTHY";
  }

  // Active Segment Protection (never delete WRITING, CLOSING, VALIDATING, LEGAL_HOLD, EVIDENCE_LOCK)
  protectSegment(segmentId: string): void {
    this.protectedSegments.add(segmentId);
  }

  unprotectSegment(segmentId: string): void {
    this.protectedSegments.delete(segmentId);
  }

  isSegmentProtected(segmentId: string): boolean {
    return this.protectedSegments.has(segmentId);
  }

  getAllNodes(): ManagedStorageNode[] {
    return [...this.nodes.values()];
  }
}
