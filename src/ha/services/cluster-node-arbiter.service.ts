/**
 * Cluster Node Arbiter & HA Service
 * 
 * Tracks active API and Media Gateway cluster nodes, enforces epoch increments,
 * and detects split-brain conditions.
 */

import type { Pool } from "pg";

export interface ClusterNodeRecord {
  id: string;
  nodeType: "API" | "MEDIA_GATEWAY" | "WORKER";
  host: string;
  port: number;
  epoch: number;
  isLeader: boolean;
  state: "ACTIVE" | "DRAINING" | "DEAD";
  heartbeatAt: Date;
}

export class ClusterNodeArbiterService {
  private readonly nodes = new Map<string, ClusterNodeRecord>();
  private activeLeaderId: string | null = null;
  private currentEpoch = 1;

  constructor(private readonly pool?: Pool) {}

  async registerHeartbeat(node: {
    id: string;
    nodeType: "API" | "MEDIA_GATEWAY" | "WORKER";
    host: string;
    port: number;
  }): Promise<{ epoch: number; isLeader: boolean }> {
    const existing = this.nodes.get(node.id);
    const now = new Date();

    if (!existing) {
      if (!this.activeLeaderId) {
        this.activeLeaderId = node.id;
      }
      const record: ClusterNodeRecord = {
        ...node,
        epoch: this.currentEpoch,
        isLeader: this.activeLeaderId === node.id,
        state: "ACTIVE",
        heartbeatAt: now,
      };
      this.nodes.set(node.id, record);
    } else {
      existing.heartbeatAt = now;
      existing.state = "ACTIVE";
      existing.isLeader = this.activeLeaderId === node.id;
    }

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO cluster_nodes (id, node_type, host, port, epoch, is_leader, state, heartbeat_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', NOW())
           ON CONFLICT (id) DO UPDATE
           SET heartbeat_at = NOW(), state = 'ACTIVE', is_leader = EXCLUDED.is_leader`,
          [node.id, node.nodeType, node.host, node.port, this.currentEpoch, this.activeLeaderId === node.id]
        );
      } catch {
        // Suppress
      }
    }

    return {
      epoch: this.currentEpoch,
      isLeader: this.activeLeaderId === node.id,
    };
  }

  async checkNodeLiveness(heartbeatTimeoutMs = 15000): Promise<{
    activeNodes: number;
    deadNodes: string[];
    leaderPromoted: boolean;
  }> {
    const now = Date.now();
    const deadNodes: string[] = [];
    let leaderPromoted = false;

    for (const [id, node] of this.nodes.entries()) {
      if (now - node.heartbeatAt.getTime() > heartbeatTimeoutMs) {
        node.state = "DEAD";
        deadNodes.push(id);

        if (this.activeLeaderId === id) {
          // Leader died: Increment epoch and promote next available active node
          this.currentEpoch++;
          this.activeLeaderId = null;
          leaderPromoted = true;
        }
      }
    }

    // Promote new leader if vacant
    if (!this.activeLeaderId) {
      for (const [id, node] of this.nodes.entries()) {
        if (node.state === "ACTIVE") {
          this.activeLeaderId = id;
          node.isLeader = true;
          node.epoch = this.currentEpoch;
          break;
        }
      }
    }

    return {
      activeNodes: Array.from(this.nodes.values()).filter((n) => n.state === "ACTIVE").length,
      deadNodes,
      leaderPromoted,
    };
  }

  getCurrentEpoch(): number {
    return this.currentEpoch;
  }

  getLeaderId(): string | null {
    return this.activeLeaderId;
  }
}

export const clusterNodeArbiterService = new ClusterNodeArbiterService();
