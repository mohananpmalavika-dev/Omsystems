/**
 * Media Gateway Monitoring Service
 * 
 * Collects real-time metrics from media gateways:
 * - System resources (CPU, RAM, disk, network)
 * - Stream health (active, degraded, failed)
 * - Camera ownership via distributed leases
 * - Performance metrics (bitrate, FPS, packet loss)
 * - Process health (FFmpeg, restarts, crashes)
 */

import type { MediaGatewayHealth, CapacityCalculation, CapacityConstraints } from "../domain/ha-telemetry.types.js";
import type { CameraLeaseManager } from "./camera-lease-manager.service.js";

interface MediaGatewayHeartbeat {
  gatewayId: string;
  gatewayName: string;
  ipAddress: string;
  timestamp: string;
  
  // System metrics
  cpuPercent: number;
  memoryPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  diskWriteMbps: number;
  diskReadMbps: number;
  diskUsedPercent: number;
  networkInMbps: number;
  networkOutMbps: number;
  
  // Stream metrics
  activeStreams: number;
  recordingStreams: number;
  liveViewStreams: number;
  healthyStreams: number;
  degradedStreams: number;
  failedStreams: number;
  
  // Stream quality
  avgBitrate: number;
  avgFrameRate: number;
  packetLoss: number;
  frameDrops: number;
  
  // Process health
  ffmpegProcesses: number;
  restarts: number;
  crashCount: number;
  lastRestartAt?: string;
  
  // Capacity
  capacityConstraints: CapacityConstraints;
}

interface GatewayRegistration {
  gatewayId: string;
  gatewayName: string;
  ipAddress: string;
  registeredAt: string;
  lastHeartbeatAt: string;
  consecutiveFailures: number;
}

export class MediaGatewayMonitor {
  private registeredGateways: Map<string, GatewayRegistration> = new Map();
  private latestHeartbeats: Map<string, MediaGatewayHeartbeat> = new Map();
  private leaseManager: CameraLeaseManager;
  private heartbeatTimeoutMs: number;

  constructor(leaseManager: CameraLeaseManager, heartbeatTimeoutMs: number = 10000) {
    this.leaseManager = leaseManager;
    this.heartbeatTimeoutMs = heartbeatTimeoutMs;
  }

  /**
   * Register a new media gateway
   */
  registerGateway(
    gatewayId: string,
    gatewayName: string,
    ipAddress: string,
  ): void {
    this.registeredGateways.set(gatewayId, {
      gatewayId,
      gatewayName,
      ipAddress,
      registeredAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      consecutiveFailures: 0,
    });
  }

  /**
   * Process heartbeat from a media gateway
   */
  async processHeartbeat(heartbeat: MediaGatewayHeartbeat): Promise<void> {
    if (!heartbeat.gatewayId || !heartbeat.gatewayName || !heartbeat.ipAddress) {
      throw new Error("Heartbeat must include gatewayId, gatewayName, and ipAddress");
    }
    const numericValues = [
      heartbeat.cpuPercent, heartbeat.memoryPercent, heartbeat.memoryUsedMb, heartbeat.memoryTotalMb,
      heartbeat.diskWriteMbps, heartbeat.diskReadMbps, heartbeat.diskUsedPercent,
      heartbeat.networkInMbps, heartbeat.networkOutMbps, heartbeat.activeStreams,
      heartbeat.recordingStreams, heartbeat.liveViewStreams, heartbeat.healthyStreams,
      heartbeat.degradedStreams, heartbeat.failedStreams, heartbeat.avgBitrate,
      heartbeat.avgFrameRate, heartbeat.packetLoss, heartbeat.frameDrops, heartbeat.ffmpegProcesses,
      heartbeat.restarts, heartbeat.crashCount, heartbeat.capacityConstraints?.maxConcurrentStreams,
      heartbeat.capacityConstraints?.maxNetworkMbps, heartbeat.capacityConstraints?.maxDiskWriteMbps,
      heartbeat.capacityConstraints?.maxDecoders, heartbeat.capacityConstraints?.maxEncoders,
      heartbeat.capacityConstraints?.safetyMarginPercent,
    ];
    if (numericValues.some((value) => !Number.isFinite(value))) {
      throw new Error("Heartbeat contains invalid numeric telemetry");
    }

    this.latestHeartbeats.set(heartbeat.gatewayId, heartbeat);

    const registration = this.registeredGateways.get(heartbeat.gatewayId);
    if (registration) {
      // Heartbeats are untrusted remote input.  Using their wall-clock value
      // lets a skewed or malicious future timestamp keep an offline gateway
      // eligible for failover avoidance indefinitely.  Liveness is measured
      // at receipt time on the control plane instead.
      registration.lastHeartbeatAt = new Date().toISOString();
      registration.consecutiveFailures = 0;
    } else {
      // Auto-register if not already registered
      this.registerGateway(
        heartbeat.gatewayId,
        heartbeat.gatewayName,
        heartbeat.ipAddress,
      );
    }
  }

  /**
   * Get current health status of all registered gateways
   */
  async getAllGatewayHealth(): Promise<MediaGatewayHealth[]> {
    const healthReports: MediaGatewayHealth[] = [];
    const now = Date.now();

    for (const registration of this.registeredGateways.values()) {
      const health = await this.getGatewayHealth(registration.gatewayId, now);
      healthReports.push(health);
    }

    return healthReports;
  }

  /**
   * Get health status for a specific gateway
   */
  async getGatewayHealth(
    gatewayId: string,
    now: number = Date.now(),
  ): Promise<MediaGatewayHealth> {
    const registration = this.registeredGateways.get(gatewayId);
    const heartbeat = this.latestHeartbeats.get(gatewayId);

    if (!registration) {
      throw new Error(`Gateway ${gatewayId} not registered`);
    }

    const lastHeartbeatTime = new Date(registration.lastHeartbeatAt).getTime();
    const heartbeatAgeMs = now - lastHeartbeatTime;
    const isReachable = heartbeatAgeMs < this.heartbeatTimeoutMs;

    // Get owned cameras from lease manager
    const ownedCameraIds = isReachable
      ? await this.leaseManager.getCamerasByGateway(gatewayId)
      : [];

    if (!heartbeat || !isReachable) {
      // Gateway is offline or heartbeat missing
      return {
        gatewayId: registration.gatewayId,
        gatewayName: registration.gatewayName,
        ipAddress: registration.ipAddress,
        status: "offline",
        isReachable: false,
        capacityStreams: 0,
        activeStreams: 0,
        recordingStreams: 0,
        liveViewStreams: 0,
        utilizationPercent: 0,
        ownedCameraIds,
        leaseExpirySeconds: 0,
        leaseRenewals: 0,
        leaseConflicts: 0,
        cpuPercent: 0,
        memoryPercent: 0,
        diskWriteMbps: 0,
        diskReadMbps: 0,
        diskUsedPercent: 0,
        networkInMbps: 0,
        networkOutMbps: 0,
        healthyStreams: 0,
        degradedStreams: 0,
        failedStreams: 0,
        avgBitrate: 0,
        avgFrameRate: 0,
        packetLoss: 0,
        frameDrops: 0,
        ffmpegProcesses: 0,
        restarts: heartbeat?.restarts || 0,
        crashCount: heartbeat?.crashCount || 0,
        lastRestartAt: heartbeat?.lastRestartAt,
        lastHeartbeatAt: registration.lastHeartbeatAt,
        heartbeatAgeMs,
        lastProbeAt: new Date().toISOString(),
      };
    }

    // Calculate capacity
    const capacity = this.calculateCapacity(heartbeat);
    const utilizationPercent = (heartbeat.activeStreams / capacity.safeLimit) * 100;

    // Determine status
    let status: MediaGatewayHealth["status"] = "healthy";
    if (!isReachable || heartbeat.crashCount > 0) {
      status = "offline";
    } else if (heartbeat.failedStreams > 5 || heartbeat.cpuPercent > 90) {
      status = "degraded";
    } else if (utilizationPercent > 95) {
      status = "overloaded";
    }

    return {
      gatewayId: heartbeat.gatewayId,
      gatewayName: heartbeat.gatewayName,
      ipAddress: heartbeat.ipAddress,
      status,
      isReachable,
      capacityStreams: capacity.safeLimit,
      activeStreams: heartbeat.activeStreams,
      recordingStreams: heartbeat.recordingStreams,
      liveViewStreams: heartbeat.liveViewStreams,
      utilizationPercent,
      ownedCameraIds,
      leaseExpirySeconds: 0, // TODO: Calculate from leases
      leaseRenewals: 0, // TODO: Track renewal count
      leaseConflicts: 0, // TODO: Track conflict count
      cpuPercent: heartbeat.cpuPercent,
      memoryPercent: heartbeat.memoryPercent,
      diskWriteMbps: heartbeat.diskWriteMbps,
      diskReadMbps: heartbeat.diskReadMbps,
      diskUsedPercent: heartbeat.diskUsedPercent,
      networkInMbps: heartbeat.networkInMbps,
      networkOutMbps: heartbeat.networkOutMbps,
      healthyStreams: heartbeat.healthyStreams,
      degradedStreams: heartbeat.degradedStreams,
      failedStreams: heartbeat.failedStreams,
      avgBitrate: heartbeat.avgBitrate,
      avgFrameRate: heartbeat.avgFrameRate,
      packetLoss: heartbeat.packetLoss,
      frameDrops: heartbeat.frameDrops,
      ffmpegProcesses: heartbeat.ffmpegProcesses,
      restarts: heartbeat.restarts,
      crashCount: heartbeat.crashCount,
      lastRestartAt: heartbeat.lastRestartAt,
      lastHeartbeatAt: registration.lastHeartbeatAt,
      heartbeatAgeMs,
      lastProbeAt: new Date().toISOString(),
    };
  }

  /**
   * Calculate dynamic capacity based on system resources
   * This replaces hard-coded capacity values with real constraints
   */
  calculateCapacity(heartbeat: MediaGatewayHeartbeat): CapacityCalculation {
    const constraints = heartbeat.capacityConstraints;
    const safetyMargin = Math.max(0, Math.min(1, 1 - constraints.safetyMarginPercent / 100));

    // Calculate limits from each resource
    const streamLimit = Math.max(0, constraints.maxConcurrentStreams);
    
    // CPU-based limit (assume 2% CPU per stream)
    const cpuAvailable = Math.max(0, 100 - heartbeat.cpuPercent);
    const cpuLimit = Math.floor(cpuAvailable / 2);
    
    // Network-based limit (assume 4 Mbps per stream)
    const networkAvailable = Math.max(0, Math.max(0, constraints.maxNetworkMbps) - heartbeat.networkInMbps);
    const networkLimit = Math.floor(networkAvailable / 4);
    
    // Disk-based limit (assume 3 Mbps per recording stream)
    const diskAvailable = Math.max(0, Math.max(0, constraints.maxDiskWriteMbps) - heartbeat.diskWriteMbps);
    const diskLimit = Math.floor(diskAvailable / 3);
    
    // Memory-based limit (assume 100MB per stream)
    const memoryAvailableMb = Math.max(0, heartbeat.memoryTotalMb * (1 - heartbeat.memoryPercent / 100));
    const memoryLimit = Math.floor(memoryAvailableMb / 100);
    
    // Decoder/encoder limits
    const decoderLimit = Math.max(0, constraints.maxDecoders);
    const encoderLimit = Math.max(0, constraints.maxEncoders);

    // Find bottleneck
    const limits = {
      stream: streamLimit,
      cpu: cpuLimit,
      network: networkLimit,
      disk: diskLimit,
      memory: memoryLimit,
      decoder: decoderLimit,
      encoder: encoderLimit,
    };

    const hardLimit = Math.min(...Object.values(limits));
    const safeLimit = Math.max(0, Math.floor(hardLimit * safetyMargin));
    const currentUsed = heartbeat.activeStreams;
    const availableHeadroom = Math.max(0, safeLimit - currentUsed);
    const utilizationPercent = safeLimit > 0
      ? (currentUsed / safeLimit) * 100
      : (currentUsed > 0 ? 100 : 0);

    // Identify bottleneck
    let bottleneck: CapacityCalculation["bottleneck"] = undefined;
    if (hardLimit === cpuLimit) bottleneck = "cpu";
    else if (hardLimit === networkLimit) bottleneck = "network";
    else if (hardLimit === diskLimit) bottleneck = "disk";
    else if (hardLimit === decoderLimit) bottleneck = "decoders";
    else if (hardLimit === encoderLimit) bottleneck = "encoders";

    return {
      theoreticalMax: streamLimit,
      hardLimit,
      safeLimit,
      currentUsed,
      availableHeadroom,
      utilizationPercent,
      isAtCapacity: availableHeadroom <= 0,
      bottleneck,
    };
  }

  /**
   * Calculate aggregate capacity across all gateways
   */
  async getTotalCapacity(): Promise<{
    totalCapacity: number;
    totalActive: number;
    totalAvailable: number;
    utilizationPercent: number;
    gatewayCount: number;
    healthyGateways: number;
  }> {
    const allHealth = await this.getAllGatewayHealth();

    let totalCapacity = 0;
    let totalActive = 0;
    let healthyGateways = 0;

    for (const health of allHealth) {
      totalCapacity += health.capacityStreams;
      totalActive += health.activeStreams;
      if (health.status === "healthy") {
        healthyGateways++;
      }
    }

    const totalAvailable = Math.max(0, totalCapacity - totalActive);
    const utilizationPercent = totalCapacity > 0 ? (totalActive / totalCapacity) * 100 : 0;

    return {
      totalCapacity,
      totalActive,
      totalAvailable,
      utilizationPercent,
      gatewayCount: allHealth.length,
      healthyGateways,
    };
  }

  /**
   * Detect failed gateways that need failover
   */
  async detectFailedGateways(): Promise<string[]> {
    const now = Date.now();
    const failedGateways: string[] = [];

    for (const registration of this.registeredGateways.values()) {
      const lastHeartbeatTime = new Date(registration.lastHeartbeatAt).getTime();
      const heartbeatAgeMs = now - lastHeartbeatTime;

      if (heartbeatAgeMs > this.heartbeatTimeoutMs) {
        failedGateways.push(registration.gatewayId);
      }
    }

    return failedGateways;
  }

  /**
   * Mark gateway failures and increment failure counter
   */
  markGatewayFailure(gatewayId: string): void {
    const registration = this.registeredGateways.get(gatewayId);
    if (registration) {
      registration.consecutiveFailures++;
    }
  }

  /**
   * Get gateways sorted by available capacity (for load balancing)
   */
  async getGatewaysByAvailableCapacity(): Promise<Array<{
    gatewayId: string;
    availableCapacity: number;
    utilizationPercent: number;
  }>> {
    const allHealth = await this.getAllGatewayHealth();

    return allHealth
      .filter((h) => h.status === "healthy")
      .map((h) => ({
        gatewayId: h.gatewayId,
        availableCapacity: h.capacityStreams - h.activeStreams,
        utilizationPercent: h.utilizationPercent,
      }))
      .sort((a, b) => b.availableCapacity - a.availableCapacity);
  }
}
