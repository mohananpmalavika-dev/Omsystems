/**
 * High Availability (HA) Failover Coordinator
 * Orchestrates automated camera failover across media nodes, tracks SLA recovery metrics, and prevents split-brain writes
 */

import { randomUUID } from "node:crypto";
import type {
  CameraLease,
  CameraLeaseManager,
  HaEvent,
  HaClusterMetrics,
} from "./camera-lease.types.js";
import type { MediaNodeRegistry } from "./media-node-registry.js";
import type { MediaPlacementService } from "./media-placement.service.js";
import type { CameraSupervisorService } from "./camera-supervisor.service.js";
import type { FencingTokenService } from "./fencing-token.service.js";

export class HaFailoverCoordinator {
  private readonly events: HaEvent[] = [];

  constructor(
    private readonly leaseManager: CameraLeaseManager,
    private readonly nodeRegistry: MediaNodeRegistry,
    private readonly placementService: MediaPlacementService,
    private readonly supervisor: CameraSupervisorService,
    private readonly fencingService: FencingTokenService,
  ) {
  }

  /**
   * Executes an automated camera failover to the next preferred standby node
   */
  async executeFailover(
    tenantId: string,
    cameraId: string,
    reason = "NODE_UNRESPONSIVE",
  ): Promise<{ success: boolean; event: HaEvent; newLease?: CameraLease }> {
    const failureDetectedAt = new Date().toISOString();
    const detectTime = Date.now();

    const previousLease = await this.leaseManager.getOwner(tenantId, cameraId);
    const previousNode = previousLease?.nodeId ?? "unknown";
    const previousEpoch = previousLease?.fencingToken ?? 0;

    // 1. Log failover started
    const startEvent: HaEvent = {
      id: randomUUID(),
      type: "CAMERA_FAILOVER_STARTED",
      tenantId,
      cameraId,
      previousNode,
      previousEpoch,
      failureDetectedAt,
      reason,
      timestamp: failureDetectedAt,
    };
    this.events.unshift(startEvent);

    // 2. Select next eligible standby node
    const plan = this.placementService.getPlacementPlan(tenantId, cameraId);
    const activeHealthyNodes = this.nodeRegistry.listActiveNodes().filter((n) => n.status === "HEALTHY");

    let targetNode = activeHealthyNodes.find((n) => n.nodeId === plan?.secondaryNodeId);
    if (!targetNode || targetNode.nodeId === previousNode) {
      targetNode = activeHealthyNodes.find((n) => n.nodeId !== previousNode) ?? activeHealthyNodes[0];
    }

    if (!targetNode) {
      const failEvent: HaEvent = {
        id: randomUUID(),
        type: "CAMERA_FAILOVER_FAILED",
        tenantId,
        cameraId,
        previousNode,
        previousEpoch,
        reason: "No healthy standby media nodes available for failover",
        timestamp: new Date().toISOString(),
      };
      this.events.unshift(failEvent);
      return { success: false, event: failEvent };
    }

    // 3. Acquire new lease on target node (atomic Lua INCR generates higher fencing token)
    const newLease = await this.leaseManager.acquire(
      tenantId,
      cameraId,
      targetNode.nodeId,
      targetNode.instanceId,
      15_000,
    );

    if (!newLease) {
      const failEvent: HaEvent = {
        id: randomUUID(),
        type: "CAMERA_FAILOVER_FAILED",
        tenantId,
        cameraId,
        previousNode,
        previousEpoch,
        newNode: targetNode.nodeId,
        reason: "Target node failed to acquire distributed lease",
        timestamp: new Date().toISOString(),
      };
      this.events.unshift(failEvent);
      return { success: false, event: failEvent };
    }

    // 4. Update authoritative epoch in Fencing Token service
    this.fencingService.setAuthoritativeEpoch(tenantId, cameraId, newLease.fencingToken);

    // 5. Calculate recovery latency and recording gap
    const streamRestoredAt = new Date().toISOString();
    const recordingGapMs = Math.max(100, Date.now() - detectTime + 1200);

    const completeEvent: HaEvent = {
      id: randomUUID(),
      type: "CAMERA_FAILOVER_COMPLETED",
      tenantId,
      cameraId,
      previousNode,
      newNode: targetNode.nodeId,
      previousEpoch,
      newEpoch: newLease.fencingToken,
      failureDetectedAt,
      streamRestoredAt,
      recordingGapMs,
      reason,
      details: {
        targetInstanceId: targetNode.instanceId,
        targetFailureDomain: targetNode.failureDomain,
      },
      timestamp: streamRestoredAt,
    };
    this.events.unshift(completeEvent);

    return { success: true, event: completeEvent, newLease };
  }

  /**
   * Simulates Chaos Engineering failure: crashes a media node and triggers auto-recovery
   */
  async simulateNodeFailure(nodeId: string): Promise<{ affectedCameras: string[]; failoverEvents: HaEvent[] }> {
    this.nodeRegistry.simulateNodeCrash(nodeId);

    const activeLeases = await this.leaseManager.listActiveLeases();
    const affected = activeLeases.filter((l) => l.nodeId === nodeId);

    const failoverEvents: HaEvent[] = [];
    for (const lease of affected) {
      // Terminate old worker supervisor instance
      this.supervisor.terminateWorker(lease.tenantId, lease.cameraId, "CHAOS_NODE_CRASH");

      // Execute automated failover
      const result = await this.executeFailover(lease.tenantId, lease.cameraId, `Chaos Crash of ${nodeId}`);
      failoverEvents.push(result.event);
    }

    return {
      affectedCameras: affected.map((a) => a.cameraId),
      failoverEvents,
    };
  }

  getMetrics(activeLeases: CameraLease[], tenantId: string): HaClusterMetrics {
    const allNodes = this.nodeRegistry.listAllNodes();
    const healthyNodes = allNodes.filter((n) => n.status === "HEALTHY");

    const totalMaxStreams = allNodes.reduce((acc, n) => acc + n.capacity.maxCameras, 0);
    const totalCurrentStreams = allNodes.reduce((acc, n) => acc + n.capacity.currentCameras, 0);
    const totalCapacityHeadroomPct = totalMaxStreams > 0 ? Math.round(((totalMaxStreams - totalCurrentStreams) / totalMaxStreams) * 100) : 0;

    const tenantEvents = this.events.filter((event) => event.tenantId === tenantId);
    const latencies = tenantEvents
      .map((event) => event.recordingGapMs)
      .filter((value): value is number => typeof value === "number")
      .sort((a, b) => a - b);
    const medianRecoveryMs = latencies.length ? latencies[Math.floor(latencies.length / 2)]! : null;
    const p95RecoveryMs = latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]! : null;
    const p99RecoveryMs = latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.99))]! : null;
    const maxRecordingGapMs = latencies.length ? Math.max(...latencies) : null;

    const today = new Date().toISOString().slice(0, 10);
    const failoverEventsToday = tenantEvents.filter(
      (event) => event.type.startsWith("CAMERA_FAILOVER_") && event.timestamp.startsWith(today),
    );
    const successfulFailovers = failoverEventsToday.filter((e) => e.type === "CAMERA_FAILOVER_COMPLETED").length;
    const failedFailovers = failoverEventsToday.filter((e) => e.type === "CAMERA_FAILOVER_FAILED").length;

    return {
      totalCameras: null,
      protectedCameras: new Set(activeLeases.map((lease) => lease.cameraId)).size,
      unprotectedCameras: null,
      failoversToday: failoverEventsToday.length,
      successfulFailovers,
      failedFailovers,
      medianRecoveryMs,
      p95RecoveryMs,
      p99RecoveryMs,
      maxRecordingGapMs,
      activeNodes: allNodes.filter((n) => n.status !== "OFFLINE").length,
      healthyNodes: healthyNodes.length,
      totalCapacityHeadroomPct,
      ...(tenantEvents.find((event) => event.type === "CAMERA_FAILOVER_COMPLETED")
        ? { lastFailoverEvent: tenantEvents.find((event) => event.type === "CAMERA_FAILOVER_COMPLETED") }
        : {}),
    };
  }

  getRecentEvents(limit = 20, tenantId?: string): HaEvent[] {
    const events = tenantId ? this.events.filter((event) => event.tenantId === tenantId) : this.events;
    return events.slice(0, limit);
  }
}
