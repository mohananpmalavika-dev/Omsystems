/**
 * Media Node Registry
 * Manages unique process instance identities, heartbeats, failure domains, and node capacity
 */

import { randomUUID } from "node:crypto";
import type { MediaNodeInstance, MediaNodeStatus, FailureDomain, MediaNodeCapacity } from "./camera-lease.types.js";

export class MediaNodeRegistry {
  private readonly nodes = new Map<string, MediaNodeInstance>();
  private readonly heartbeatTtlMs = 15_000;

  constructor() {
    this.seedDefaultNodes();
  }

  private seedDefaultNodes() {
    const defaultNodes: Array<Omit<MediaNodeInstance, "instanceId" | "lastHeartbeat" | "bootedAt">> = [
      {
        nodeId: "media-node-01",
        nodeName: "Media Gateway Alpha",
        host: "10.0.1.10",
        port: 8554,
        version: "3.4.2",
        role: "PRIMARY_INGEST",
        status: "HEALTHY",
        failureDomain: {
          datacenter: "DC-MUMBAI-01",
          zone: "ZONE-A",
          rack: "RACK-04",
          host: "BLADE-SRV-101",
          network: "VLAN-210-MEDIA",
          storagePool: "POOL-NVME-01",
        },
        capacity: {
          maxCameras: 150,
          currentCameras: 42,
          cpuPct: 38,
          memoryPct: 45,
          ingressMbps: 320,
          maxIngressMbps: 1200,
          diskWriteMbps: 110,
          maxDiskWriteMbps: 500,
          activeRtspSessions: 42,
          activeRecordingSessions: 42,
        },
      },
      {
        nodeId: "media-node-02",
        nodeName: "Media Gateway Bravo",
        host: "10.0.2.10",
        port: 8554,
        version: "3.4.2",
        role: "SECONDARY_INGEST",
        status: "HEALTHY",
        failureDomain: {
          datacenter: "DC-MUMBAI-01",
          zone: "ZONE-B",
          rack: "RACK-12",
          host: "BLADE-SRV-102",
          network: "VLAN-220-MEDIA",
          storagePool: "POOL-NVME-02",
        },
        capacity: {
          maxCameras: 150,
          currentCameras: 38,
          cpuPct: 34,
          memoryPct: 41,
          ingressMbps: 290,
          maxIngressMbps: 1200,
          diskWriteMbps: 95,
          maxDiskWriteMbps: 500,
          activeRtspSessions: 38,
          activeRecordingSessions: 38,
        },
      },
      {
        nodeId: "media-node-03",
        nodeName: "Media Gateway Charlie (DR)",
        host: "10.0.3.10",
        port: 8554,
        version: "3.4.2",
        role: "SECONDARY_INGEST",
        status: "HEALTHY",
        failureDomain: {
          datacenter: "DC-HYDERABAD-02",
          zone: "ZONE-A",
          rack: "RACK-01",
          host: "DR-SRV-201",
          network: "VLAN-310-MEDIA",
          storagePool: "POOL-SAN-03",
        },
        capacity: {
          maxCameras: 200,
          currentCameras: 12,
          cpuPct: 18,
          memoryPct: 26,
          ingressMbps: 95,
          maxIngressMbps: 2000,
          diskWriteMbps: 35,
          maxDiskWriteMbps: 800,
          activeRtspSessions: 12,
          activeRecordingSessions: 12,
        },
      },
    ];

    const now = Date.now();
    for (const node of defaultNodes) {
      const instance: MediaNodeInstance = {
        ...node,
        instanceId: randomUUID(),
        lastHeartbeat: now,
        bootedAt: now - 3600_000,
      };
      this.nodes.set(node.nodeId, instance);
    }
  }

  registerNode(
    nodeId: string,
    nodeName: string,
    host: string,
    port: number,
    failureDomain: FailureDomain,
    capacity: MediaNodeCapacity,
    role: MediaNodeInstance["role"] = "PRIMARY_INGEST",
  ): MediaNodeInstance {
    const instanceId = randomUUID();
    const now = Date.now();
    const instance: MediaNodeInstance = {
      nodeId,
      instanceId,
      nodeName,
      host,
      port,
      version: "3.4.2",
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
    if (node.status === "OFFLINE") {
      node.status = "HEALTHY";
    }
    if (capacityUpdates) {
      node.capacity = { ...node.capacity, ...capacityUpdates };
    }
    return true;
  }

  getNode(nodeId: string): MediaNodeInstance | undefined {
    this.pruneStaleNodes();
    return this.nodes.get(nodeId);
  }

  listActiveNodes(): MediaNodeInstance[] {
    this.pruneStaleNodes();
    return Array.from(this.nodes.values()).filter((n) => n.status !== "OFFLINE");
  }

  listAllNodes(): MediaNodeInstance[] {
    this.pruneStaleNodes();
    return Array.from(this.nodes.values());
  }

  setNodeStatus(nodeId: string, status: MediaNodeStatus): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.status = status;
    }
  }

  simulateNodeCrash(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.status = "OFFLINE";
      node.lastHeartbeat = Date.now() - (this.heartbeatTtlMs + 5_000);
    }
  }

  private pruneStaleNodes() {
    const now = Date.now();
    for (const node of this.nodes.values()) {
      if (now - node.lastHeartbeat > this.heartbeatTtlMs && node.status !== "OFFLINE") {
        node.status = "OFFLINE";
      }
    }
  }
}

export const mediaNodeRegistry = new MediaNodeRegistry();
