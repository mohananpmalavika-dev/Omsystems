/**
 * HA Failover Orchestrator
 * 
 * Coordinates automatic failover across all components:
 * - Detects failed media gateways
 * - Transfers camera leases to healthy gateways
 * - Records RTO/RPO metrics
 * - Generates HA events for audit
 * - Ensures zero recording gaps
 */

import type { CameraLeaseManager } from "./camera-lease-manager.service.js";
import type { MediaGatewayMonitor } from "./media-gateway-monitor.service.js";
import type { HAEvent, CameraLeaseTransfer } from "../domain/ha-telemetry.types.js";

interface FailoverResult {
  success: boolean;
  failedGatewayId: string;
  affectedCameras: number;
  transferredCameras: number;
  failedTransfers: number;
  detectionTimeMs: number;
  transferTimeMs: number;
  totalRtoMs: number;
  recordingGapMs: number;
  transfers: CameraLeaseTransfer[];
  events: HAEvent[];
}

interface FailoverConfig {
  detectionIntervalMs: number;
  maxCamerasPerGateway: number;
  enableAutoFailover: boolean;
  recordingGapToleranceMs: number;
}

export class FailoverOrchestrator {
  private leaseManager: CameraLeaseManager;
  private gatewayMonitor: MediaGatewayMonitor;
  private config: FailoverConfig;
  private tenantId: string;
  private failoverInProgress: Set<string> = new Set();

  constructor(
    tenantId: string,
    leaseManager: CameraLeaseManager,
    gatewayMonitor: MediaGatewayMonitor,
    config: Partial<FailoverConfig> = {},
  ) {
    this.tenantId = tenantId;
    this.leaseManager = leaseManager;
    this.gatewayMonitor = gatewayMonitor;
    this.config = {
      detectionIntervalMs: config.detectionIntervalMs ?? 5000,
      maxCamerasPerGateway: config.maxCamerasPerGateway ?? 250,
      enableAutoFailover: config.enableAutoFailover ?? true,
      recordingGapToleranceMs: config.recordingGapToleranceMs ?? 2000,
    };
  }

  /**
   * Main failover detection and execution loop
   * Run this periodically to detect and handle gateway failures
   */
  async detectAndHandleFailures(): Promise<FailoverResult[]> {
    if (!this.config.enableAutoFailover) {
      return [];
    }

    const failedGateways = await this.gatewayMonitor.detectFailedGateways();
    const results: FailoverResult[] = [];

    for (const gatewayId of failedGateways) {
      // Skip if failover already in progress for this gateway
      if (this.failoverInProgress.has(gatewayId)) {
        continue;
      }

      this.failoverInProgress.add(gatewayId);

      try {
        const result = await this.executeFailover(gatewayId);
        results.push(result);
      } finally {
        this.failoverInProgress.delete(gatewayId);
      }
    }

    return results;
  }

  /**
   * Execute failover for a specific failed gateway
   */
  async executeFailover(failedGatewayId: string): Promise<FailoverResult> {
    const failoverStartTime = Date.now();
    const events: HAEvent[] = [];

    // Event: Failover initiated
    events.push(this.createEvent({
      eventType: "failover-initiated",
      severity: "critical",
      component: "media-gateway",
      nodeId: failedGatewayId,
      message: `Initiating automatic failover for gateway ${failedGatewayId}`,
      details: { reason: "heartbeat-timeout" },
    }));

    // Step 1: Get all cameras owned by failed gateway
    const affectedCameras = await this.leaseManager.getCamerasByGateway(failedGatewayId);
    const detectionTimeMs = Date.now() - failoverStartTime;

    if (affectedCameras.length === 0) {
      events.push(this.createEvent({
        eventType: "failover-completed",
        severity: "info",
        component: "media-gateway",
        nodeId: failedGatewayId,
        message: `No cameras owned by failed gateway ${failedGatewayId}`,
        details: {},
      }));

      return {
        success: true,
        failedGatewayId,
        affectedCameras: 0,
        transferredCameras: 0,
        failedTransfers: 0,
        detectionTimeMs,
        transferTimeMs: 0,
        totalRtoMs: Date.now() - failoverStartTime,
        recordingGapMs: 0,
        transfers: [],
        events,
      };
    }

    // Step 2: Select target gateways based on available capacity
    const transferStartTime = Date.now();
    const targetGateways = await this.selectTargetGateways(affectedCameras.length);

    if (targetGateways.length === 0) {
      events.push(this.createEvent({
        eventType: "failover-failed",
        severity: "critical",
        component: "media-gateway",
        nodeId: failedGatewayId,
        message: `No healthy gateways available for failover`,
        details: { affectedCameras: affectedCameras.length },
      }));

      return {
        success: false,
        failedGatewayId,
        affectedCameras: affectedCameras.length,
        transferredCameras: 0,
        failedTransfers: affectedCameras.length,
        detectionTimeMs,
        transferTimeMs: Date.now() - transferStartTime,
        totalRtoMs: Date.now() - failoverStartTime,
        recordingGapMs: 0, // Unknown
        transfers: [],
        events,
      };
    }

    // Step 3: Transfer cameras to healthy gateways using round-robin
    const transfers: CameraLeaseTransfer[] = [];
    let transferredCount = 0;
    let failedCount = 0;
    let targetIndex = 0;

    for (const cameraId of affectedCameras) {
      const targetGatewayId = targetGateways[targetIndex % targetGateways.length]!;
      targetIndex++;

      const transferResult = await this.leaseManager.forceAcquireCameraLease(
        cameraId,
        targetGatewayId,
        "gateway-failure",
      );

      if (transferResult.acquired && transferResult.lease) {
        transferredCount++;

        const transfer: CameraLeaseTransfer = {
          cameraId,
          previousOwner: failedGatewayId,
          newOwner: targetGatewayId,
          reason: "failover",
          initiatedAt: new Date(failoverStartTime).toISOString(),
          completedAt: new Date().toISOString(),
          reconnectAttempts: 0,
          status: "completed",
        };

        transfers.push(transfer);

        events.push(this.createEvent({
          eventType: "camera-lease-transferred",
          severity: "info",
          component: "media-gateway",
          nodeId: targetGatewayId,
          message: `Camera ${cameraId} transferred to gateway ${targetGatewayId}`,
          details: {
            cameraId,
            previousOwner: failedGatewayId,
            newOwner: targetGatewayId,
          },
        }));
      } else {
        failedCount++;

        transfers.push({
          cameraId,
          previousOwner: failedGatewayId,
          newOwner: targetGatewayId,
          reason: "failover",
          initiatedAt: new Date(failoverStartTime).toISOString(),
          reconnectAttempts: 1,
          status: "failed",
        });
      }
    }

    const transferTimeMs = Date.now() - transferStartTime;
    const totalRtoMs = Date.now() - failoverStartTime;

    // Estimate recording gap (time from detection to completion)
    const recordingGapMs = Math.max(0, totalRtoMs - this.config.recordingGapToleranceMs);

    // Final event
    events.push(this.createEvent({
      eventType: "failover-completed",
      severity: failedCount === 0 ? "info" : "warning",
      component: "media-gateway",
      nodeId: failedGatewayId,
      message: `Failover completed: ${transferredCount}/${affectedCameras.length} cameras transferred`,
      details: {
        affectedCameras: affectedCameras.length,
        transferredCameras: transferredCount,
        failedTransfers: failedCount,
        targetGateways: targetGateways.length,
      },
      rtoMs: totalRtoMs,
      recordingGapMs,
      affectedCameras: affectedCameras.length,
    }));

    return {
      success: failedCount === 0,
      failedGatewayId,
      affectedCameras: affectedCameras.length,
      transferredCameras: transferredCount,
      failedTransfers: failedCount,
      detectionTimeMs,
      transferTimeMs,
      totalRtoMs,
      recordingGapMs,
      transfers,
      events,
    };
  }

  /**
   * Select target gateways for camera transfer based on capacity
   */
  private async selectTargetGateways(cameraCount: number): Promise<string[]> {
    const gateways = await this.gatewayMonitor.getGatewaysByAvailableCapacity();

    // Filter gateways with sufficient capacity
    const suitableGateways = gateways.filter(
      (g) => g.availableCapacity >= 10 && g.utilizationPercent < 90,
    );

    if (suitableGateways.length === 0) {
      // Fallback: use any healthy gateway
      return gateways.map((g) => g.gatewayId);
    }

    // Calculate how many gateways we need
    const camerasPerGateway = Math.ceil(cameraCount / Math.max(suitableGateways.length, 1));

    // Use top gateways by available capacity
    return suitableGateways
      .slice(0, Math.ceil(cameraCount / Math.max(camerasPerGateway, 1)))
      .map((g) => g.gatewayId);
  }

  /**
   * Manually trigger failover for a specific gateway (for testing)
   */
  async manualFailover(gatewayId: string): Promise<FailoverResult> {
    return this.executeFailover(gatewayId);
  }

  /**
   * Rebalance cameras across gateways based on load
   */
  async rebalanceCameras(): Promise<{
    rebalanced: number;
    transfers: CameraLeaseTransfer[];
  }> {
    // Get current gateway utilization
    const gateways = await this.gatewayMonitor.getGatewaysByAvailableCapacity();

    if (gateways.length < 2) {
      return { rebalanced: 0, transfers: [] };
    }

    // Identify overloaded and underloaded gateways
    const avgUtilization = gateways.reduce((sum, g) => sum + g.utilizationPercent, 0) / gateways.length;
    const overloadedGateways = gateways.filter((g) => g.utilizationPercent > avgUtilization + 20);
    const underloadedGateways = gateways.filter((g) => g.utilizationPercent < avgUtilization - 20);

    if (overloadedGateways.length === 0 || underloadedGateways.length === 0) {
      return { rebalanced: 0, transfers: [] };
    }

    const transfers: CameraLeaseTransfer[] = [];
    let rebalancedCount = 0;

    // Transfer cameras from overloaded to underloaded gateways
    for (const overloaded of overloadedGateways) {
      const camerasToMove = Math.ceil((overloaded.utilizationPercent - avgUtilization) / 100 * this.config.maxCamerasPerGateway);
      const ownedCameras = await this.leaseManager.getCamerasByGateway(overloaded.gatewayId);
      const camerasToTransfer = ownedCameras.slice(0, Math.min(camerasToMove, ownedCameras.length / 2));

      for (const cameraId of camerasToTransfer) {
        const targetGateway = underloadedGateways[rebalancedCount % underloadedGateways.length];
        if (!targetGateway) continue;

        const result = await this.leaseManager.forceAcquireCameraLease(
          cameraId,
          targetGateway.gatewayId,
          "rebalance",
        );

        if (result.acquired) {
          rebalancedCount++;
          transfers.push({
            cameraId,
            previousOwner: overloaded.gatewayId,
            newOwner: targetGateway.gatewayId,
            reason: "rebalance",
            initiatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            reconnectAttempts: 0,
            status: "completed",
          });
        }
      }
    }

    return { rebalanced: rebalancedCount, transfers };
  }

  /**
   * Create an HA event for audit trail
   */
  private createEvent(params: {
    eventType: HAEvent["eventType"];
    severity: HAEvent["severity"];
    component: HAEvent["component"];
    nodeId?: string;
    nodeName?: string;
    message: string;
    details: Record<string, unknown>;
    rtoMs?: number;
    recordingGapMs?: number;
    affectedCameras?: number;
  }): HAEvent {
    return {
      id: `ha-event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tenantId: this.tenantId,
      timestamp: new Date().toISOString(),
      eventType: params.eventType,
      severity: params.severity,
      component: params.component,
      nodeId: params.nodeId,
      nodeName: params.nodeName,
      message: params.message,
      details: params.details,
      rtoMs: params.rtoMs,
      recordingGapMs: params.recordingGapMs,
      affectedCameras: params.affectedCameras,
    };
  }
}
