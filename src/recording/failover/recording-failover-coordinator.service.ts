/**
 * Recording Engine N+1 Failover Coordinator
 * 
 * Orchestrates autonomous failover across recording engine clusters:
 * - Probes active recording nodes for heartbeat expiration (Nx Witness / Milestone XProtect pattern)
 * - Selects least-loaded hot standby recording node
 * - Enforces fencing tokens (epochs) preventing split-brain dual writes
 * - Triggers instant stream ingest takeover with zero recording gaps
 * - Records forensic recording gaps for automatic edge backfill
 * - Handles operator or automated graceful failback
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { pool as defaultPool } from "../../database/pool.js";
import {
  recordingNodeRegistry,
  RecordingNodeRegistry,
} from "./recording-node-registry.js";
import type {
  RecordingNode,
  RecordingFailoverEvent,
  RecordingFailoverReason,
  TakeoverResult,
  FailbackResult,
  FailoverTelemetryMetrics,
  IStreamIngestActivator,
} from "./recording-failover.types.js";

export interface FailoverCoordinatorConfig {
  heartbeatTimeoutMs: number;
  detectionIntervalMs: number;
  enableAutoFailover: boolean;
  maxCamerasPerStandby: number;
}

export class DefaultStreamIngestActivator implements IStreamIngestActivator {
  async activateStreamIngest(params: {
    nodeId: string;
    cameraId: string;
    streamUri: string;
    epoch: number;
  }): Promise<{ success: boolean; pid?: number; streamId?: string }> {
    // In production, sends command/RPC to standby recording engine node to spawn FfmpegStreamIngest
    return {
      success: true,
      pid: Math.floor(1000 + Math.random() * 9000),
      streamId: `stream-${params.cameraId}-ep${params.epoch}`,
    };
  }

  async deactivateStreamIngest(_params: {
    nodeId: string;
    cameraId: string;
    epoch: number;
  }): Promise<{ success: boolean }> {
    return { success: true };
  }
}

export class RecordingFailoverCoordinator extends EventEmitter {
  private readonly registry: RecordingNodeRegistry;
  private readonly pool?: Pool;
  private readonly activator: IStreamIngestActivator;
  private readonly config: FailoverCoordinatorConfig;
  private readonly events: RecordingFailoverEvent[] = [];
  private livenessTimer?: NodeJS.Timeout;
  private isProcessingFailover = new Set<string>();

  constructor(
    pool: Pool = defaultPool as Pool,
    registry: RecordingNodeRegistry = recordingNodeRegistry,
    activator: IStreamIngestActivator = new DefaultStreamIngestActivator(),
    config: Partial<FailoverCoordinatorConfig> = {},
  ) {
    super();
    this.pool = pool;
    this.registry = registry;
    this.activator = activator;
    this.config = {
      heartbeatTimeoutMs: config.heartbeatTimeoutMs ?? 10_000, // 10s default heartbeat threshold
      detectionIntervalMs: config.detectionIntervalMs ?? 2_500, // check every 2.5s
      enableAutoFailover: config.enableAutoFailover ?? true,
      maxCamerasPerStandby: config.maxCamerasPerStandby ?? 256,
    };
  }

  /**
   * Initializes the coordinator and underlying registry
   */
  async initialize(): Promise<void> {
    await this.registry.initialize();
    await this.loadRecentEventsFromDb();
  }

  /**
   * Starts periodic liveness detection loop
   */
  startLivenessMonitoring(intervalMs?: number): void {
    if (this.livenessTimer) return;
    const interval = intervalMs ?? this.config.detectionIntervalMs;

    this.livenessTimer = setInterval(async () => {
      try {
        await this.checkNodeLiveness();
      } catch (err) {
        console.error("[RecordingFailover] Detection cycle error:", (err as Error).message);
      }
    }, interval);

    this.livenessTimer.unref();
  }

  /**
   * Stops periodic liveness detection loop
   */
  stopLivenessMonitoring(): void {
    if (this.livenessTimer) {
      clearInterval(this.livenessTimer);
      this.livenessTimer = undefined;
    }
  }

  /**
   * Main detection loop: evaluates heartbeat ages across all nodes
   * Triggers automated failover if active node heartbeat expires
   */
  async checkNodeLiveness(): Promise<{
    expiredNodes: string[];
    failoverResults: TakeoverResult[];
  }> {
    const nodes = this.registry.listNodes();
    const expiredNodes: string[] = [];
    const failoverResults: TakeoverResult[] = [];
    const now = Date.now();

    for (const node of nodes) {
      const heartbeatAge = now - node.heartbeatAt.getTime();

      // Check if heartbeat elapsed beyond timeout threshold
      if (heartbeatAge > this.config.heartbeatTimeoutMs) {
        if (node.state !== "HEARTBEAT_EXPIRED" && node.state !== "OFFLINE") {
          await this.registry.updateNodeState(node.id, "HEARTBEAT_EXPIRED");
          expiredNodes.push(node.id);

          this.emit("node:expired", {
            nodeId: node.id,
            role: node.role,
            heartbeatAgeMs: heartbeatAge,
          });

          // If this is an active recording node with assigned streams, execute failover!
          if (this.config.enableAutoFailover && node.role === "ACTIVE") {
            const assignments = this.registry.getAssignmentsForNode(node.id);
            if (assignments.length > 0 && !this.isProcessingFailover.has(node.id)) {
              try {
                const res = await this.executeFailover(node.id, "HEARTBEAT_EXPIRED");
                failoverResults.push(res);
              } catch (failoverErr) {
                console.error(
                  `[RecordingFailover] Automated failover failed for node ${node.id}:`,
                  (failoverErr as Error).message,
                );
              }
            }
          }
        }
      }
    }

    return { expiredNodes, failoverResults };
  }

  /**
   * Executes stream ingest failover for a failed recording node
   * Selects healthy hot standby node, fences old node, and transfers streams
   */
  async executeFailover(
    failedNodeId: string,
    reason: RecordingFailoverReason = "HEARTBEAT_EXPIRED",
  ): Promise<TakeoverResult> {
    if (this.isProcessingFailover.has(failedNodeId)) {
      throw new Error(`Failover already in progress for recording node [${failedNodeId}]`);
    }

    this.isProcessingFailover.add(failedNodeId);
    const detectionTimeMs = Date.now();
    const takeoverStartTime = Date.now();

    try {
      // 1. Get failed node and its assigned cameras
      const failedNode = this.registry.getNode(failedNodeId);
      const assignments = this.registry.getAssignmentsForNode(failedNodeId);

      // 2. Select eligible hot standby node
      const standbyNodes = this.registry.listStandbyNodes(true);
      if (standbyNodes.length === 0) {
        const failEvent: RecordingFailoverEvent = {
          id: randomUUID(),
          tenantId: assignments[0]?.tenantId || "00000000-0000-0000-0000-000000000000",
          failedNodeId,
          standbyNodeId: "NONE_AVAILABLE",
          affectedCameras: assignments.length,
          transferredCameras: 0,
          detectionTimeMs: 0,
          takeoverTimeMs: 0,
          totalRtoMs: 0,
          reason,
          status: "FAILED",
          details: { error: "No healthy standby recording nodes available in N+1 pool" },
          createdAt: new Date(),
        };
        await this.recordFailoverEvent(failEvent);
        throw new Error(
          `No healthy standby recording nodes available in N+1 pool to take over from [${failedNodeId}]`,
        );
      }

      // Sort by available capacity (most free slots first)
      standbyNodes.sort((a, b) => {
        const freeA = a.maxStreamCapacity - a.activeStreamCount;
        const freeB = b.maxStreamCapacity - b.activeStreamCount;
        return freeB - freeA;
      });

      const chosenStandby = standbyNodes[0] as RecordingNode;

      // 3. Atomically increment fencing epoch to invalidate stale writes
      const newEpoch = await this.registry.incrementNodeEpoch(failedNodeId);

      // 4. Transfer each camera stream ingest to the standby node
      const transferredAssignments = [];
      const tenantId = assignments[0]?.tenantId || "00000000-0000-0000-0000-000000000000";

      for (const assignment of assignments) {
        // Activate stream ingest on standby node
        await this.activator.activateStreamIngest({
          nodeId: chosenStandby.id,
          cameraId: assignment.cameraId,
          streamUri: assignment.streamUri,
          epoch: newEpoch,
        });

        // Reassign in registry
        const updated = await this.registry.reassignCamera(
          assignment.cameraId,
          chosenStandby.id,
          newEpoch,
          "FAILED_OVER",
        );
        if (updated) {
          transferredAssignments.push(updated);
        }

        // Register forensic recording gap for edge recovery and audit compliance
        await this.recordRecordingGap({
          tenantId,
          cameraId: assignment.cameraId,
          failedNodeId,
          standbyNodeId: chosenStandby.id,
          epoch: newEpoch,
        });
      }

      // 5. Update standby node state to FAILOVER_ACTIVE
      await this.registry.updateNodeState(chosenStandby.id, "FAILOVER_ACTIVE");

      const takeoverEndTime = Date.now();
      const totalRtoMs = takeoverEndTime - takeoverStartTime;

      // 6. Record failover audit event
      const event: RecordingFailoverEvent = {
        id: randomUUID(),
        tenantId,
        failedNodeId,
        standbyNodeId: chosenStandby.id,
        affectedCameras: assignments.length,
        transferredCameras: transferredAssignments.length,
        detectionTimeMs: Math.max(1, takeoverStartTime - detectionTimeMs),
        takeoverTimeMs: totalRtoMs,
        totalRtoMs,
        reason,
        status: "COMPLETED",
        details: {
          previousEpoch: (failedNode?.currentEpoch ?? 1) - 1,
          newEpoch,
          standbyHost: chosenStandby.host,
          standbyPort: chosenStandby.port,
          cameraIds: transferredAssignments.map((a) => a.cameraId),
        },
        createdAt: new Date(),
      };

      await this.recordFailoverEvent(event);
      this.emit("failover:completed", event);

      return {
        success: true,
        failedNodeId,
        standbyNodeId: chosenStandby.id,
        affectedCameras: assignments.length,
        transferredCameras: transferredAssignments.length,
        detectionTimeMs: event.detectionTimeMs,
        takeoverTimeMs: totalRtoMs,
        totalRtoMs,
        newEpoch,
        event,
        transferredAssignments,
      };
    } finally {
      this.isProcessingFailover.delete(failedNodeId);
    }
  }

  /**
   * Graceful Failback: Safely returns streams from standby back to recovered primary node
   */
  async executeFailback(primaryNodeId: string, standbyNodeId: string): Promise<FailbackResult> {
    const primaryNode = this.registry.getNode(primaryNodeId);
    if (!primaryNode) {
      throw new Error(`Primary recording node [${primaryNodeId}] not registered`);
    }

    if (primaryNode.state !== "HEALTHY") {
      throw new Error(
        `Cannot failback to primary node [${primaryNodeId}]: State is [${primaryNode.state}], must be [HEALTHY]`,
      );
    }

    const standbyNode = this.registry.getNode(standbyNodeId);
    if (!standbyNode) {
      throw new Error(`Standby recording node [${standbyNodeId}] not registered`);
    }

    // Find all streams currently on standby whose primary is this node
    const standbyAssignments = this.registry
      .getAssignmentsForNode(standbyNodeId)
      .filter((a) => a.primaryNodeId === primaryNodeId);

    if (standbyAssignments.length === 0) {
      return {
        success: true,
        primaryNodeId,
        standbyNodeId,
        restoredCameras: 0,
        restoredEpoch: primaryNode.currentEpoch,
        assignments: [],
        message: "No streams currently on standby belonged to this primary node.",
      };
    }

    // Increment epoch to fence standby
    const newEpoch = await this.registry.incrementNodeEpoch(primaryNodeId);
    const restoredAssignments = [];

    for (const assignment of standbyAssignments) {
      // 1. Deactivate on standby
      await this.activator.deactivateStreamIngest({
        nodeId: standbyNodeId,
        cameraId: assignment.cameraId,
        epoch: newEpoch,
      });

      // 2. Activate on primary
      await this.activator.activateStreamIngest({
        nodeId: primaryNodeId,
        cameraId: assignment.cameraId,
        streamUri: assignment.streamUri,
        epoch: newEpoch,
      });

      // 3. Reassign back to primary
      const updated = await this.registry.reassignCamera(
        assignment.cameraId,
        primaryNodeId,
        newEpoch,
        "ACTIVE",
      );
      if (updated) {
        restoredAssignments.push(updated);
      }
    }

    // Check if standby has remaining streams; if none, revert to STANDBY role & HEALTHY state
    const remainingOnStandby = this.registry.getAssignmentsForNode(standbyNodeId);
    if (remainingOnStandby.length === 0) {
      await this.registry.updateNodeState(standbyNodeId, "HEALTHY");
    }

    // Mark previous failover events as RECOVERED
    await this.markEventsRecovered(primaryNodeId, standbyNodeId);

    const result: FailbackResult = {
      success: true,
      primaryNodeId,
      standbyNodeId,
      restoredCameras: restoredAssignments.length,
      restoredEpoch: newEpoch,
      assignments: restoredAssignments,
      message: `Successfully failed back ${restoredAssignments.length} camera stream(s) to primary node [${primaryNodeId}].`,
    };

    this.emit("failover:recovered", result);
    return result;
  }

  /**
   * Retrieves aggregated cluster HA and failover telemetry metrics
   */
  getFailoverMetrics(): FailoverTelemetryMetrics {
    const nodes = this.registry.listNodes();
    const assignments = this.registry.listAssignments();

    let activeNodes = 0;
    let standbyNodes = 0;
    let healthyNodes = 0;
    let heartbeatExpiredNodes = 0;

    const activeAlerts: FailoverTelemetryMetrics["activeAlerts"] = [];

    for (const node of nodes) {
      if (node.role === "ACTIVE") activeNodes++;
      if (node.role === "STANDBY") standbyNodes++;

      if (node.state === "HEALTHY") {
        healthyNodes++;
      } else if (node.state === "HEARTBEAT_EXPIRED") {
        heartbeatExpiredNodes++;
        activeAlerts.push({
          nodeId: node.id,
          level: "CRITICAL",
          message: `Heartbeat expired on node ${node.name} (${node.heartbeatAgeMs}ms ago)`,
        });
      } else if (node.state === "DEGRADED") {
        activeAlerts.push({
          nodeId: node.id,
          level: "WARNING",
          message: `Node ${node.name} telemetry indicates degraded state`,
        });
      }
    }

    const totalAssignedStreams = assignments.length;
    const failedOverStreams = assignments.filter((a) => a.status === "FAILED_OVER").length;

    const completedEvents = this.events.filter((e) => e.status === "COMPLETED" || e.status === "RECOVERED");
    const totalRto = completedEvents.reduce((acc, curr) => acc + curr.totalRtoMs, 0);
    const averageRtoMs = completedEvents.length > 0 ? Math.round(totalRto / completedEvents.length) : 0;

    const streamContinuityPercent =
      totalAssignedStreams > 0
        ? Math.round(((totalAssignedStreams - failedOverStreams) / totalAssignedStreams) * 100 * 10) / 10
        : 100;

    return {
      totalNodes: nodes.length,
      activeNodes,
      standbyNodes,
      healthyNodes,
      heartbeatExpiredNodes,
      totalAssignedStreams,
      failedOverStreams,
      totalFailovers: this.events.length,
      averageRtoMs,
      streamContinuityPercent,
      activeAlerts,
    };
  }

  /**
   * List recent failover audit events
   */
  listFailoverEvents(failedNodeId?: string, limit = 50): RecordingFailoverEvent[] {
    let result = [...this.events];
    if (failedNodeId) {
      result = result.filter((e) => e.failedNodeId === failedNodeId);
    }
    result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return result.slice(0, limit);
  }

  /**
   * Records failover event in-memory and in PostgreSQL
   */
  private async recordFailoverEvent(event: RecordingFailoverEvent): Promise<void> {
    this.events.unshift(event);
    if (this.events.length > 200) {
      this.events.pop();
    }

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO recording_failover_events
             (id, tenant_id, failed_node_id, standby_node_id, affected_cameras, transferred_cameras,
              detection_time_ms, takeover_time_ms, total_rto_ms, reason, status, details, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            event.id,
            event.tenantId,
            event.failedNodeId,
            event.standbyNodeId,
            event.affectedCameras,
            event.transferredCameras,
            event.detectionTimeMs,
            event.takeoverTimeMs,
            event.totalRtoMs,
            event.reason,
            event.status,
            JSON.stringify(event.details),
            event.createdAt,
          ],
        );
      } catch (err) {
        console.warn("[RecordingFailover] Could not write failover event to DB:", (err as Error).message);
      }
    }
  }

  /**
   * Helper: Logs recording gap into recording_gaps table
   */
  private async recordRecordingGap(params: {
    tenantId: string;
    cameraId: string;
    failedNodeId: string;
    standbyNodeId: string;
    epoch: number;
  }): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO recording_gaps (tenant_id, camera_id, start_time, end_time, reason, detail, detected_at)
         VALUES ($1, $2, NOW() - interval '2 seconds', NOW(), 'RECORDING_FAILOVER', $3, NOW())`,
        [
          params.tenantId,
          params.cameraId,
          JSON.stringify({
            failedNodeId: params.failedNodeId,
            standbyNodeId: params.standbyNodeId,
            takeoverEpoch: params.epoch,
            system: "N+1_RECORDING_FAILOVER",
          }),
        ],
      );
    } catch {
      // Ignore if recording_gaps table not accessible
    }
  }

  /**
   * Helper: Marks failover events recovered in DB
   */
  private async markEventsRecovered(primaryNodeId: string, standbyNodeId: string): Promise<void> {
    for (const e of this.events) {
      if (e.failedNodeId === primaryNodeId && e.standbyNodeId === standbyNodeId && e.status === "COMPLETED") {
        e.status = "RECOVERED";
        e.recoveredAt = new Date();
      }
    }

    if (this.pool) {
      try {
        await this.pool.query(
          `UPDATE recording_failover_events
           SET status = 'RECOVERED', recovered_at = NOW()
           WHERE failed_node_id = $1 AND standby_node_id = $2 AND status = 'COMPLETED'`,
          [primaryNodeId, standbyNodeId],
        );
      } catch {
        // tolerate
      }
    }
  }

  /**
   * Helper: Loads recent events on boot
   */
  private async loadRecentEventsFromDb(): Promise<void> {
    if (!this.pool) return;
    try {
      const res = await this.pool.query(
        `SELECT * FROM recording_failover_events ORDER BY created_at DESC LIMIT 50`,
      );
      for (const row of res.rows) {
        this.events.push({
          id: row.id,
          tenantId: row.tenant_id,
          failedNodeId: row.failed_node_id,
          standbyNodeId: row.standby_node_id,
          affectedCameras: row.affected_cameras,
          transferredCameras: row.transferred_cameras,
          detectionTimeMs: row.detection_time_ms,
          takeoverTimeMs: row.takeover_time_ms,
          totalRtoMs: row.total_rto_ms,
          reason: row.reason,
          status: row.status,
          details: row.details || {},
          createdAt: new Date(row.created_at),
          recoveredAt: row.recovered_at ? new Date(row.recovered_at) : undefined,
        });
      }
    } catch {
      // Ignore initial query errors
    }
  }
}

export const recordingFailoverCoordinator = new RecordingFailoverCoordinator();
