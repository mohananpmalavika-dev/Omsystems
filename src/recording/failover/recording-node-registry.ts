/**
 * Recording Node Registry
 * 
 * Manages the cluster directory of active and standby recording nodes,
 * heartbeat telemetry states, and camera stream ingest assignments.
 * Dual-mode: Backed by PostgreSQL with robust in-memory fallback.
 */

import type { Pool } from "pg";
import { pool as defaultPool } from "../../database/pool.js";
import type {
  RecordingNode,
  RecordingNodeRole,
  RecordingNodeState,
  RecordingNodeAssignment,
  RecordingHeartbeatPayload,
} from "./recording-failover.types.js";

export class RecordingNodeRegistry {
  private readonly nodes = new Map<string, RecordingNode>();
  private readonly assignments = new Map<string, RecordingNodeAssignment>();
  private isInitialized = false;

  constructor(private readonly pool?: Pool) {
    // If no pool passed, try using default pool
    if (pool === undefined) {
      this.pool = defaultPool as Pool;
    }
  }

  /**
   * Initializes registry by loading existing cluster records from PostgreSQL
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (!this.pool) return;

    try {
      // 1. Load recording nodes
      const nodesResult = await this.pool.query(
        `SELECT * FROM recording_nodes ORDER BY role ASC, name ASC`,
      );
      for (const row of nodesResult.rows) {
        const node: RecordingNode = {
          id: row.id,
          name: row.name,
          host: row.host,
          port: row.port,
          role: row.role as RecordingNodeRole,
          state: row.state as RecordingNodeState,
          currentEpoch: Number(row.current_epoch) || 1,
          maxStreamCapacity: row.max_stream_capacity,
          activeStreamCount: row.active_stream_count,
          cpuPercent: parseFloat(row.cpu_percent) || 0,
          memoryPercent: parseFloat(row.memory_percent) || 0,
          diskWriteMbps: parseFloat(row.disk_write_mbps) || 0,
          networkInMbps: parseFloat(row.network_in_mbps) || 0,
          heartbeatAt: new Date(row.heartbeat_at),
          metadata: row.metadata || {},
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
        };
        this.nodes.set(node.id, node);
      }

      // 2. Load stream ingest assignments
      const assignmentsResult = await this.pool.query(
        `SELECT * FROM recording_node_assignments ORDER BY created_at ASC`,
      );
      for (const row of assignmentsResult.rows) {
        const assignment: RecordingNodeAssignment = {
          id: row.id,
          cameraId: row.camera_id,
          tenantId: row.tenant_id,
          primaryNodeId: row.primary_node_id,
          currentNodeId: row.current_node_id,
          streamUri: row.stream_uri,
          streamProfile: row.stream_profile,
          status: row.status,
          takeoverEpoch: Number(row.takeover_epoch) || 1,
          failedOverAt: row.failed_over_at ? new Date(row.failed_over_at) : undefined,
          lastGapLoggedAt: row.last_gap_logged_at ? new Date(row.last_gap_logged_at) : undefined,
          metadata: row.metadata || {},
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
        };
        this.assignments.set(assignment.cameraId, assignment);
      }
    } catch (err) {
      // Non-fatal fallback to in-memory during cold boots or when tables are not yet migrated
      console.warn("[RecordingNodeRegistry] DB sync deferred or offline:", (err as Error).message);
    }
  }

  /**
   * Register or update a recording node
   */
  async registerNode(params: {
    id: string;
    name: string;
    host: string;
    port?: number;
    role?: RecordingNodeRole;
    maxStreamCapacity?: number;
    metadata?: Record<string, unknown>;
  }): Promise<RecordingNode> {
    const existing = this.nodes.get(params.id);
    const now = new Date();

    const node: RecordingNode = {
      id: params.id,
      name: params.name,
      host: params.host,
      port: params.port ?? existing?.port ?? 8085,
      role: params.role ?? existing?.role ?? "ACTIVE",
      state: existing?.state ?? "HEALTHY",
      currentEpoch: existing?.currentEpoch ?? 1,
      maxStreamCapacity: params.maxStreamCapacity ?? existing?.maxStreamCapacity ?? 128,
      activeStreamCount: existing?.activeStreamCount ?? 0,
      cpuPercent: existing?.cpuPercent ?? 0,
      memoryPercent: existing?.memoryPercent ?? 0,
      diskWriteMbps: existing?.diskWriteMbps ?? 0,
      networkInMbps: existing?.networkInMbps ?? 0,
      heartbeatAt: existing?.heartbeatAt ?? now,
      metadata: { ...(existing?.metadata || {}), ...(params.metadata || {}) },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.nodes.set(node.id, node);

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO recording_nodes
             (id, name, host, port, role, state, current_epoch, max_stream_capacity, active_stream_count, metadata, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             host = EXCLUDED.host,
             port = EXCLUDED.port,
             role = EXCLUDED.role,
             max_stream_capacity = EXCLUDED.max_stream_capacity,
             metadata = EXCLUDED.metadata,
             updated_at = NOW()`,
          [
            node.id,
            node.name,
            node.host,
            node.port,
            node.role,
            node.state,
            node.currentEpoch,
            node.maxStreamCapacity,
            node.activeStreamCount,
            JSON.stringify(node.metadata),
          ],
        );
      } catch (err) {
        console.warn("[RecordingNodeRegistry] Could not persist node registration:", (err as Error).message);
      }
    }

    return this.getNodeWithAge(node);
  }

  /**
   * Process a heartbeat packet from an active or standby recording node
   */
  async recordHeartbeat(payload: RecordingHeartbeatPayload): Promise<RecordingNode> {
    const now = new Date();
    let node = this.nodes.get(payload.nodeId);

    if (!node) {
      // Auto-register discovered node
      node = {
        id: payload.nodeId,
        name: payload.name || `Recording Node ${payload.nodeId}`,
        host: payload.host || "127.0.0.1",
        port: payload.port || 8085,
        role: payload.role || "ACTIVE",
        state: "HEALTHY",
        currentEpoch: payload.epoch || 1,
        maxStreamCapacity: payload.maxStreamCapacity || 128,
        activeStreamCount: payload.activeStreamCount || 0,
        cpuPercent: payload.cpuPercent || 0,
        memoryPercent: payload.memoryPercent || 0,
        diskWriteMbps: payload.diskWriteMbps || 0,
        networkInMbps: payload.networkInMbps || 0,
        heartbeatAt: now,
        metadata: payload.metadata || {},
        createdAt: now,
        updatedAt: now,
      };
    } else {
      node.heartbeatAt = now;
      node.state = "HEALTHY";
      if (payload.cpuPercent !== undefined) node.cpuPercent = payload.cpuPercent;
      if (payload.memoryPercent !== undefined) node.memoryPercent = payload.memoryPercent;
      if (payload.diskWriteMbps !== undefined) node.diskWriteMbps = payload.diskWriteMbps;
      if (payload.networkInMbps !== undefined) node.networkInMbps = payload.networkInMbps;
      if (payload.activeStreamCount !== undefined) node.activeStreamCount = payload.activeStreamCount;
      if (payload.maxStreamCapacity !== undefined) node.maxStreamCapacity = payload.maxStreamCapacity;
      if (payload.role !== undefined) node.role = payload.role;
      if (payload.metadata) node.metadata = { ...node.metadata, ...payload.metadata };
      node.updatedAt = now;
    }

    this.nodes.set(node.id, node);

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO recording_nodes
             (id, name, host, port, role, state, current_epoch, max_stream_capacity, active_stream_count,
              cpu_percent, memory_percent, disk_write_mbps, network_in_mbps, heartbeat_at, metadata, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'HEALTHY', $6, $7, $8, $9, $10, $11, $12, NOW(), $13, NOW())
           ON CONFLICT (id) DO UPDATE SET
             state = 'HEALTHY',
             cpu_percent = EXCLUDED.cpu_percent,
             memory_percent = EXCLUDED.memory_percent,
             disk_write_mbps = EXCLUDED.disk_write_mbps,
             network_in_mbps = EXCLUDED.network_in_mbps,
             active_stream_count = EXCLUDED.active_stream_count,
             heartbeat_at = NOW(),
             updated_at = NOW()`,
          [
            node.id,
            node.name,
            node.host,
            node.port,
            node.role,
            node.currentEpoch,
            node.maxStreamCapacity,
            node.activeStreamCount,
            node.cpuPercent,
            node.memoryPercent,
            node.diskWriteMbps,
            node.networkInMbps,
            JSON.stringify(node.metadata),
          ],
        );
      } catch (err) {
        // Silently tolerate during testing without live postgres
      }
    }

    return this.getNodeWithAge(node);
  }

  /**
   * Fetch single node with computed heartbeat age in milliseconds
   */
  getNode(nodeId: string): RecordingNode | undefined {
    const node = this.nodes.get(nodeId);
    if (!node) return undefined;
    return this.getNodeWithAge(node);
  }

  /**
   * List all recording nodes
   */
  listNodes(filter?: { role?: RecordingNodeRole; state?: RecordingNodeState }): RecordingNode[] {
    let result = Array.from(this.nodes.values());
    if (filter?.role) {
      result = result.filter((n) => n.role === filter.role);
    }
    if (filter?.state) {
      result = result.filter((n) => n.state === filter.state);
    }
    return result.map((n) => this.getNodeWithAge(n));
  }

  /**
   * List all eligible standby nodes ready to assume ingestion
   */
  listStandbyNodes(healthyOnly = true): RecordingNode[] {
    return this.listNodes({ role: "STANDBY" }).filter((n) => {
      if (!healthyOnly) return true;
      return n.state === "HEALTHY" || n.state === "DEGRADED";
    });
  }

  /**
   * Assign or update camera stream ingest assignment
   */
  async assignCamera(params: {
    cameraId: string;
    tenantId?: string;
    primaryNodeId: string;
    currentNodeId?: string;
    streamUri: string;
    streamProfile?: string;
    metadata?: Record<string, unknown>;
  }): Promise<RecordingNodeAssignment> {
    const existing = this.assignments.get(params.cameraId);
    const now = new Date();

    const currentNodeId = params.currentNodeId ?? existing?.currentNodeId ?? params.primaryNodeId;

    const assignment: RecordingNodeAssignment = {
      id: existing?.id || `assign-${params.cameraId}`,
      cameraId: params.cameraId,
      tenantId: params.tenantId || existing?.tenantId || "00000000-0000-0000-0000-000000000000",
      primaryNodeId: params.primaryNodeId,
      currentNodeId,
      streamUri: params.streamUri,
      streamProfile: params.streamProfile || existing?.streamProfile || "main",
      status: existing?.status || "ACTIVE",
      takeoverEpoch: existing?.takeoverEpoch || 1,
      failedOverAt: existing?.failedOverAt,
      lastGapLoggedAt: existing?.lastGapLoggedAt,
      metadata: { ...(existing?.metadata || {}), ...(params.metadata || {}) },
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.assignments.set(params.cameraId, assignment);
    this.recalculateNodeStreamCounts();

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO recording_node_assignments
             (camera_id, tenant_id, primary_node_id, current_node_id, stream_uri, stream_profile, status, takeover_epoch, metadata, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           ON CONFLICT (camera_id) DO UPDATE SET
             primary_node_id = EXCLUDED.primary_node_id,
             current_node_id = EXCLUDED.current_node_id,
             stream_uri = EXCLUDED.stream_uri,
             stream_profile = EXCLUDED.stream_profile,
             status = EXCLUDED.status,
             takeover_epoch = EXCLUDED.takeover_epoch,
             metadata = EXCLUDED.metadata,
             updated_at = NOW()`,
          [
            assignment.cameraId,
            assignment.tenantId,
            assignment.primaryNodeId,
            assignment.currentNodeId,
            assignment.streamUri,
            assignment.streamProfile,
            assignment.status,
            assignment.takeoverEpoch,
            JSON.stringify(assignment.metadata),
          ],
        );
      } catch (err) {
        console.warn("[RecordingNodeRegistry] DB assign error:", (err as Error).message);
      }
    }

    return assignment;
  }

  /**
   * Retrieves single camera assignment
   */
  getAssignment(cameraId: string): RecordingNodeAssignment | undefined {
    return this.assignments.get(cameraId);
  }

  /**
   * List stream assignments for a given current node
   */
  getAssignmentsForNode(nodeId: string): RecordingNodeAssignment[] {
    return Array.from(this.assignments.values()).filter(
      (a) => a.currentNodeId === nodeId,
    );
  }

  /**
   * List all camera stream assignments
   */
  listAssignments(): RecordingNodeAssignment[] {
    return Array.from(this.assignments.values());
  }

  /**
   * Atomically reassign camera stream from failed node to standby node
   */
  async reassignCamera(
    cameraId: string,
    newCurrentNodeId: string,
    newEpoch: number,
    status: "ACTIVE" | "FAILED_OVER" = "FAILED_OVER",
  ): Promise<RecordingNodeAssignment | undefined> {
    const assignment = this.assignments.get(cameraId);
    if (!assignment) return undefined;

    assignment.currentNodeId = newCurrentNodeId;
    assignment.takeoverEpoch = newEpoch;
    assignment.status = status;
    assignment.failedOverAt = new Date();
    assignment.updatedAt = new Date();

    this.assignments.set(cameraId, assignment);
    this.recalculateNodeStreamCounts();

    if (this.pool) {
      try {
        await this.pool.query(
          `UPDATE recording_node_assignments
           SET current_node_id = $1, takeover_epoch = $2, status = $3, failed_over_at = NOW(), updated_at = NOW()
           WHERE camera_id = $4`,
          [newCurrentNodeId, newEpoch, status, cameraId],
        );
      } catch (err) {
        // Silently tolerate
      }
    }

    return assignment;
  }

  /**
   * Updates state of a recording node (e.g. HEARTBEAT_EXPIRED, OFFLINE, HEALTHY)
   */
  async updateNodeState(nodeId: string, state: RecordingNodeState): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    node.state = state;
    node.updatedAt = new Date();

    if (this.pool) {
      try {
        await this.pool.query(
          `UPDATE recording_nodes SET state = $1, updated_at = NOW() WHERE id = $2`,
          [state, nodeId],
        );
      } catch (err) {
        // tolerate
      }
    }
  }

  /**
   * Increments the fencing epoch on a node to prevent split-brain dual recording
   */
  async incrementNodeEpoch(nodeId: string): Promise<number> {
    const node = this.nodes.get(nodeId);
    const newEpoch = (node?.currentEpoch ?? 1) + 1;
    if (node) {
      node.currentEpoch = newEpoch;
      node.updatedAt = new Date();
    }

    if (this.pool) {
      try {
        await this.pool.query(
          `UPDATE recording_nodes SET current_epoch = current_epoch + 1, updated_at = NOW() WHERE id = $1`,
          [nodeId],
        );
      } catch (err) {
        // tolerate
      }
    }

    return newEpoch;
  }

  /**
   * Sets node heartbeat timestamp (useful for simulated timeouts and chaos tests)
   */
  setNodeHeartbeatAt(nodeId: string, timestamp: Date): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.heartbeatAt = timestamp;
      node.updatedAt = new Date();
    }
  }

  /**
   * Internal helper: computes heartbeat age in ms
   */
  private getNodeWithAge(node: RecordingNode): RecordingNode {
    const ageMs = Date.now() - node.heartbeatAt.getTime();
    return {
      ...node,
      heartbeatAgeMs: Math.max(0, ageMs),
    };
  }

  /**
   * Internal helper: keeps active stream counts updated per node
   */
  private recalculateNodeStreamCounts(): void {
    const counts = new Map<string, number>();
    for (const a of this.assignments.values()) {
      if (a.status === "ACTIVE" || a.status === "FAILED_OVER") {
        counts.set(a.currentNodeId, (counts.get(a.currentNodeId) || 0) + 1);
      }
    }
    for (const [nodeId, node] of this.nodes.entries()) {
      const assigned = counts.get(nodeId);
      if (assigned !== undefined) {
        node.activeStreamCount = Math.max(node.activeStreamCount, assigned);
      }
    }
  }
}

export const recordingNodeRegistry = new RecordingNodeRegistry();
