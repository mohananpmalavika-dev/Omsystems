/**
 * Cluster State & Node Registry Service
 * Manages active cluster nodes, heartbeat leases, and automatic dead node reaping.
 */

import { ClusterNodeState, NodeType, NodeHealthStatus } from '../domain/distributed-state.types.js';

export interface RegisterNodeInput {
  nodeId: string;
  nodeType: NodeType;
  address: string;
  heartbeatTtlMs?: number;
  metadata?: Record<string, unknown>;
}

export class ClusterStateService {
  private nodes = new Map<string, ClusterNodeState>();
  private readonly DEFAULT_HEARTBEAT_TTL_MS = 15_000; // 15 seconds

  /**
   * Registers or heartbeats a cluster node.
   */
  registerHeartbeat(input: RegisterNodeInput): ClusterNodeState {
    const ttlMs = input.heartbeatTtlMs || this.DEFAULT_HEARTBEAT_TTL_MS;
    const now = Date.now();

    const existing = this.nodes.get(input.nodeId);
    const assignedWorkload = existing ? existing.assignedWorkload : 0;

    const nodeState: ClusterNodeState = {
      nodeId: input.nodeId,
      nodeType: input.nodeType,
      address: input.address,
      status: 'HEALTHY',
      assignedWorkload,
      lastHeartbeatAt: now,
      leaseExpiresAt: now + ttlMs,
      metadata: input.metadata,
    };

    this.nodes.set(input.nodeId, nodeState);
    return nodeState;
  }

  /**
   * Increments or decrements assigned node workload.
   */
  adjustWorkload(nodeId: string, delta: number): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.assignedWorkload = Math.max(0, node.assignedWorkload + delta);
    }
  }

  /**
   * Reaps and marks dead nodes that missed their heartbeat deadline.
   */
  reapDeadNodes(): Array<{ nodeId: string; previousStatus: NodeHealthStatus }> {
    const now = Date.now();
    const deadNodes: Array<{ nodeId: string; previousStatus: NodeHealthStatus }> = [];

    for (const node of this.nodes.values()) {
      if (node.leaseExpiresAt <= now && node.status !== 'DEAD') {
        deadNodes.push({ nodeId: node.nodeId, previousStatus: node.status });
        node.status = 'DEAD';
      }
    }

    return deadNodes;
  }

  /**
   * Selects the healthiest node with lowest assigned workload for a role.
   */
  selectOptimalNode(role: NodeType): ClusterNodeState | null {
    this.reapDeadNodes();
    const activeCandidates = Array.from(this.nodes.values()).filter(
      (n) => n.nodeType === role && n.status === 'HEALTHY'
    );

    if (activeCandidates.length === 0) return null;

    // Pick node with lowest assigned workload
    activeCandidates.sort((a, b) => a.assignedWorkload - b.assignedWorkload);
    return activeCandidates[0]!;
  }

  listNodes(): ClusterNodeState[] {
    this.reapDeadNodes();
    return Array.from(this.nodes.values());
  }

  getNode(nodeId: string): ClusterNodeState | null {
    const node = this.nodes.get(nodeId);
    if (!node) return null;
    if (node.leaseExpiresAt <= Date.now()) {
      node.status = 'DEAD';
    }
    return node;
  }
}

export const clusterStateService = new ClusterStateService();
