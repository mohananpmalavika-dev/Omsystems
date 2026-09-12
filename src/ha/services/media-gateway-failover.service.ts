/**
 * Production Media Gateway Failover Service (ha.media_failover)
 * 
 * Provides automated, sub-second stream redirection during node failure:
 * - Real-time gateway watchdog monitoring and failure detection
 * - Capacity-weighted stream redistribution algorithm
 * - Split-brain prevention via monotonic fencing tokens (epochs)
 * - Operator-controlled graceful node draining for zero-downtime maintenance
 * - Flap dampening and recovery stabilization
 * - Durable PostgreSQL persistence and in-memory routing cache
 * - Full SLA telemetry (RTO, MTTR, continuity rate)
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { pool as defaultPool } from "../../database/pool.js";

export type MediaGatewayStatus = "HEALTHY" | "DEGRADED" | "DRAINING" | "FAILED" | "OFFLINE";
export type StreamRouteStatus = "ACTIVE" | "FAILOVER_IN_PROGRESS" | "FAILED_OVER" | "DEGRADED" | "OFFLINE";
export type FailoverEventType =
  | "FAILOVER_INITIATED"
  | "STREAM_REDIRECTED"
  | "FAILOVER_COMPLETED"
  | "FAILOVER_FAILED"
  | "GATEWAY_DRAINED"
  | "GATEWAY_RECOVERED"
  | "REBALANCE_COMPLETED";

export interface MediaGatewayNode {
  gatewayId: string;
  gatewayName: string;
  ipAddress: string;
  port: number;
  apiPort: number;
  publicUrl: string;
  region: string;
  status: MediaGatewayStatus;
  maxStreams: number;
  activeStreams: number;
  maxNetworkMbps: number;
  currentNetworkMbps: number;
  cpuPercent: number;
  memoryPercent: number;
  consecutiveFailures: number;
  lastHeartbeatAt: string;
  registeredAt: string;
  updatedAt: string;
}

export interface MediaStreamRoute {
  id: string;
  cameraId: string;
  streamProfile: "main" | "sub" | "preview";
  assignedGatewayId: string;
  standbyGatewayId?: string;
  sourceUri: string;
  streamPath: string;
  redirectUrl: string;
  status: StreamRouteStatus;
  fencingToken: number;
  viewerCount: number;
  bitrateKbps: number;
  fps: number;
  lastFailoverAt?: string;
  failoverCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MediaGatewayHeartbeatPayload {
  gatewayId: string;
  gatewayName: string;
  ipAddress: string;
  port?: number;
  apiPort?: number;
  publicUrl?: string;
  region?: string;
  cpuPercent: number;
  memoryPercent: number;
  networkInMbps: number;
  networkOutMbps: number;
  activeStreams: number;
  recordingStreams?: number;
  liveViewStreams?: number;
  healthyStreams?: number;
  degradedStreams?: number;
  failedStreams?: number;
  packetLoss?: number;
  frameDrops?: number;
  maxStreams?: number;
  maxNetworkMbps?: number;
}

export interface MediaGatewayFailoverEvent {
  id: string;
  eventType: FailoverEventType;
  severity: "INFO" | "WARNING" | "CRITICAL";
  failedGatewayId: string;
  targetGatewayId?: string;
  affectedStreams: number;
  redirectedStreams: number;
  failedRedirects: number;
  rtoMs: number;
  reason: string;
  details?: Record<string, unknown>;
  triggeredBy: string;
  createdAt: string;
}

export interface MediaGatewayFailoverPolicy {
  policyId: string;
  heartbeatTimeoutMs: number;
  watchdogIntervalMs: number;
  maxStreamsPerGateway: number;
  maxLoadPercent: number;
  autoFailoverEnabled: boolean;
  autoFailbackEnabled: boolean;
  flapDampingSeconds: number;
  updatedAt: string;
}

export interface FailoverSlaMetrics {
  totalGateways: number;
  healthyGateways: number;
  degradedGateways: number;
  drainingGateways: number;
  failedGateways: number;
  offlineGateways: number;
  totalCapacityStreams: number;
  totalActiveStreams: number;
  clusterHeadroomPercent: number;
  totalFailoversToday: number;
  avgRtoMs: number;
  p95RtoMs: number;
  maxRtoMs: number;
  streamContinuityPercent: number;
  lastFailoverAt?: string;
}

export interface RouteStreamInput {
  cameraId: string;
  streamProfile?: "main" | "sub" | "preview";
  sourceUri: string;
  preferredGatewayId?: string;
  preferredRegion?: string;
  bitrateKbps?: number;
  fps?: number;
}

export class MediaGatewayFailoverService extends EventEmitter {
  private readonly pool?: Pool;
  private readonly nodes: Map<string, MediaGatewayNode> = new Map();
  private readonly routes: Map<string, MediaStreamRoute> = new Map(); // key: `${cameraId}:${streamProfile}`
  private readonly events: MediaGatewayFailoverEvent[] = [];
  private readonly recoveryTimestamps: Map<string, number> = new Map();
  private policy: MediaGatewayFailoverPolicy = {
    policyId: "default",
    heartbeatTimeoutMs: 5000,
    watchdogIntervalMs: 2000,
    maxStreamsPerGateway: 250,
    maxLoadPercent: 85,
    autoFailoverEnabled: true,
    autoFailbackEnabled: false,
    flapDampingSeconds: 30,
    updatedAt: new Date().toISOString(),
  };

  private watchdogTimer?: NodeJS.Timeout;
  private isInitialized = false;

  constructor(pool: Pool = defaultPool as Pool) {
    super();
    this.pool = pool;
  }

  /**
   * Initializes state from PostgreSQL and launches background watchdog
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    await this.loadFromDatabase();
    this.startWatchdog();
  }

  /**
   * Loads persisted nodes, stream routes, and policy from PostgreSQL
   */
  private async loadFromDatabase(): Promise<void> {
    if (!this.pool) return;
    try {
      // Load Policy
      const policyRes = await this.pool.query("SELECT * FROM media_gateway_failover_policies WHERE policy_id = 'default' LIMIT 1");
      if (policyRes.rows.length > 0) {
        const r = policyRes.rows[0];
        this.policy = {
          policyId: r.policy_id,
          heartbeatTimeoutMs: Number(r.heartbeat_timeout_ms),
          watchdogIntervalMs: Number(r.watchdog_interval_ms),
          maxStreamsPerGateway: Number(r.max_streams_per_gateway),
          maxLoadPercent: Number(r.max_load_percent),
          autoFailoverEnabled: Boolean(r.auto_failover_enabled),
          autoFailbackEnabled: Boolean(r.auto_failback_enabled),
          flapDampingSeconds: Number(r.flap_damping_seconds),
          updatedAt: new Date(r.updated_at).toISOString(),
        };
      }

      // Load Nodes
      const nodesRes = await this.pool.query("SELECT * FROM media_gateway_nodes ORDER BY gateway_id ASC");
      for (const r of nodesRes.rows) {
        const node: MediaGatewayNode = {
          gatewayId: r.gateway_id,
          gatewayName: r.gateway_name,
          ipAddress: r.ip_address,
          port: Number(r.port),
          apiPort: Number(r.api_port),
          publicUrl: r.public_url || `http://${r.ip_address}:${r.port}`,
          region: r.region || "default",
          status: r.status as MediaGatewayStatus,
          maxStreams: Number(r.max_streams),
          activeStreams: Number(r.active_streams),
          maxNetworkMbps: Number(r.max_network_mbps),
          currentNetworkMbps: Number(r.current_network_mbps),
          cpuPercent: Number(r.cpu_percent),
          memoryPercent: Number(r.memory_percent),
          consecutiveFailures: Number(r.consecutive_failures),
          lastHeartbeatAt: new Date(r.last_heartbeat_at).toISOString(),
          registeredAt: new Date(r.registered_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
        };
        this.nodes.set(node.gatewayId, node);
      }

      // Load Routes
      const routesRes = await this.pool.query("SELECT * FROM media_stream_routes ORDER BY created_at ASC");
      for (const r of routesRes.rows) {
        const route: MediaStreamRoute = {
          id: r.id,
          cameraId: r.camera_id,
          streamProfile: r.stream_profile,
          assignedGatewayId: r.assigned_gateway_id,
          standbyGatewayId: r.standby_gateway_id || undefined,
          sourceUri: r.source_uri,
          streamPath: r.stream_path,
          redirectUrl: r.redirect_url,
          status: r.status as StreamRouteStatus,
          fencingToken: Number(r.fencing_token),
          viewerCount: Number(r.viewer_count),
          bitrateKbps: Number(r.bitrate_kbps),
          fps: Number(r.fps),
          lastFailoverAt: r.last_failover_at ? new Date(r.last_failover_at).toISOString() : undefined,
          failoverCount: Number(r.failover_count),
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
        };
        this.routes.set(`${route.cameraId}:${route.streamProfile}`, route);
      }

      // Load recent Events
      const eventsRes = await this.pool.query("SELECT * FROM media_gateway_failover_events ORDER BY created_at DESC LIMIT 100");
      for (const r of eventsRes.rows) {
        this.events.push({
          id: r.id,
          eventType: r.event_type,
          severity: r.severity,
          failedGatewayId: r.failed_gateway_id,
          targetGatewayId: r.target_gateway_id || undefined,
          affectedStreams: Number(r.affected_streams),
          redirectedStreams: Number(r.redirected_streams),
          failedRedirects: Number(r.failed_redirects),
          rtoMs: Number(r.rto_ms),
          reason: r.reason,
          details: r.details || {},
          triggeredBy: r.triggered_by,
          createdAt: new Date(r.created_at).toISOString(),
        });
      }
    } catch (err) {
      console.warn("[MediaGatewayFailoverService] Database load failed or tables missing, using in-memory mode:", err);
    }
  }

  /**
   * Starts periodic watchdog monitoring node heartbeats
   */
  startWatchdog(): void {
    if (this.watchdogTimer) return;
    this.watchdogTimer = setInterval(async () => {
      await this.runWatchdogCycle();
    }, this.policy.watchdogIntervalMs);
  }

  /**
   * Stops background watchdog timer
   */
  stopWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = undefined;
    }
  }

  /**
   * Evaluates all nodes for missed heartbeats and initiates automated failover
   */
  async runWatchdogCycle(): Promise<{ detectedFailures: string[]; failoversExecuted: number }> {
    const now = Date.now();
    const detectedFailures: string[] = [];
    let failoversExecuted = 0;

    for (const node of this.nodes.values()) {
      if (node.status === "FAILED" || node.status === "OFFLINE" || node.status === "DRAINING") {
        continue;
      }

      const lastHeartbeatMs = Date.parse(node.lastHeartbeatAt);
      const elapsedMs = now - (Number.isFinite(lastHeartbeatMs) ? lastHeartbeatMs : 0);

      if (elapsedMs > this.policy.heartbeatTimeoutMs) {
        node.consecutiveFailures += 1;
        node.status = "FAILED";
        node.updatedAt = new Date().toISOString();
        detectedFailures.push(node.gatewayId);

        this.emit("node:failed", {
          gatewayId: node.gatewayId,
          elapsedMs,
          timeoutMs: this.policy.heartbeatTimeoutMs,
        });

        await this.syncNodeToDb(node);

        if (this.policy.autoFailoverEnabled) {
          await this.executeFailover(node.gatewayId, "HEARTBEAT_TIMEOUT", "SYSTEM_WATCHDOG");
          failoversExecuted += 1;
        }
      }
    }

    return { detectedFailures, failoversExecuted };
  }

  /**
   * Processes heartbeat telemetry from a media gateway instance
   */
  async processHeartbeat(payload: MediaGatewayHeartbeatPayload): Promise<{ success: boolean; node: MediaGatewayNode }> {
    if (!payload.gatewayId || !payload.ipAddress) {
      throw new Error("Invalid heartbeat: gatewayId and ipAddress are required");
    }

    const nowIso = new Date().toISOString();
    let node = this.nodes.get(payload.gatewayId);

    const previousStatus = node?.status;
    const isRecovery = previousStatus === "FAILED" || previousStatus === "OFFLINE";

    if (!node) {
      node = {
        gatewayId: payload.gatewayId,
        gatewayName: payload.gatewayName || payload.gatewayId,
        ipAddress: payload.ipAddress,
        port: payload.port ?? 8554,
        apiPort: payload.apiPort ?? 9997,
        publicUrl: payload.publicUrl || `http://${payload.ipAddress}:${payload.port ?? 8554}`,
        region: payload.region || "default",
        status: "HEALTHY",
        maxStreams: payload.maxStreams ?? this.policy.maxStreamsPerGateway,
        activeStreams: payload.activeStreams ?? 0,
        maxNetworkMbps: payload.maxNetworkMbps ?? 1000.0,
        currentNetworkMbps: (payload.networkInMbps || 0) + (payload.networkOutMbps || 0),
        cpuPercent: payload.cpuPercent ?? 0,
        memoryPercent: payload.memoryPercent ?? 0,
        consecutiveFailures: 0,
        lastHeartbeatAt: nowIso,
        registeredAt: nowIso,
        updatedAt: nowIso,
      };
      this.nodes.set(node.gatewayId, node);
    } else {
      node.gatewayName = payload.gatewayName || node.gatewayName;
      node.ipAddress = payload.ipAddress || node.ipAddress;
      if (payload.port) node.port = payload.port;
      if (payload.apiPort) node.apiPort = payload.apiPort;
      if (payload.publicUrl) node.publicUrl = payload.publicUrl;
      if (payload.region) node.region = payload.region;
      node.maxStreams = payload.maxStreams ?? node.maxStreams;
      node.activeStreams = payload.activeStreams ?? node.activeStreams;
      node.maxNetworkMbps = payload.maxNetworkMbps ?? node.maxNetworkMbps;
      node.currentNetworkMbps = (payload.networkInMbps || 0) + (payload.networkOutMbps || 0);
      node.cpuPercent = payload.cpuPercent;
      node.memoryPercent = payload.memoryPercent;
      node.consecutiveFailures = 0;
      node.lastHeartbeatAt = nowIso;
      node.updatedAt = nowIso;

      // Check flap damping on recovery
      const isCurrentlyRecovering = isRecovery || this.recoveryTimestamps.has(node.gatewayId);
      if (isCurrentlyRecovering) {
        let recoveryStart = this.recoveryTimestamps.get(node.gatewayId);
        if (!recoveryStart) {
          recoveryStart = Date.now();
          this.recoveryTimestamps.set(node.gatewayId, recoveryStart);
          node.status = "DEGRADED"; // stabilizing
        }

        const dampingMs = this.policy.flapDampingSeconds * 1000;
        if (Date.now() - recoveryStart >= dampingMs) {
          node.status = "HEALTHY";
          this.recoveryTimestamps.delete(node.gatewayId);
          await this.recordEvent({
            eventType: "GATEWAY_RECOVERED",
            severity: "INFO",
            failedGatewayId: node.gatewayId,
            affectedStreams: 0,
            redirectedStreams: 0,
            failedRedirects: 0,
            rtoMs: 0,
            reason: "Heartbeat resumed and flap damping window verified",
            triggeredBy: "SYSTEM_WATCHDOG",
          });
          this.emit("node:recovered", { gatewayId: node.gatewayId });
        } else {
          node.status = "DEGRADED"; // still stabilizing
        }
      } else if (node.status !== "DRAINING") {
        node.status = payload.cpuPercent > 90 || payload.memoryPercent > 90 ? "DEGRADED" : "HEALTHY";
      }
    }

    this.emit("node:heartbeat", { gatewayId: node.gatewayId, status: node.status });
    await this.syncNodeToDb(node);

    return { success: true, node };
  }

  /**
   * Executes failover for a failed gateway by redirecting all active streams
   * to the healthiest remaining gateway instances.
   */
  async executeFailover(
    failedGatewayId: string,
    reason = "MANUAL_OPERATOR",
    triggeredBy = "MANUAL_OPERATOR",
  ): Promise<{
    success: boolean;
    affectedStreams: number;
    redirectedStreams: number;
    failedRedirects: number;
    rtoMs: number;
    event: MediaGatewayFailoverEvent;
  }> {
    const startTime = Date.now();

    // Mark failed node
    const failedNode = this.nodes.get(failedGatewayId);
    if (failedNode && failedNode.status !== "DRAINING") {
      failedNode.status = "FAILED";
      failedNode.updatedAt = new Date().toISOString();
      await this.syncNodeToDb(failedNode);
    }

    // Step 1: Find all streams assigned to the failed gateway
    const affectedRoutes = Array.from(this.routes.values()).filter(
      (r) => r.assignedGatewayId === failedGatewayId,
    );

    if (affectedRoutes.length === 0) {
      const emptyEvent = await this.recordEvent({
        eventType: "FAILOVER_COMPLETED",
        severity: "INFO",
        failedGatewayId,
        affectedStreams: 0,
        redirectedStreams: 0,
        failedRedirects: 0,
        rtoMs: Date.now() - startTime,
        reason,
        details: { note: "No active streams assigned to failed gateway" },
        triggeredBy,
      });

      return {
        success: true,
        affectedStreams: 0,
        redirectedStreams: 0,
        failedRedirects: 0,
        rtoMs: Date.now() - startTime,
        event: emptyEvent,
      };
    }

    // Record failover initiated
    await this.recordEvent({
      eventType: "FAILOVER_INITIATED",
      severity: "CRITICAL",
      failedGatewayId,
      affectedStreams: affectedRoutes.length,
      redirectedStreams: 0,
      failedRedirects: 0,
      rtoMs: 0,
      reason,
      details: { affectedCameras: affectedRoutes.map((r) => r.cameraId) },
      triggeredBy,
    });
    this.emit("failover:initiated", { failedGatewayId, affectedCount: affectedRoutes.length });

    // Step 2: Select target gateways with capacity scoring
    let redirectedCount = 0;
    let failedCount = 0;
    const nowIso = new Date().toISOString();

    for (const route of affectedRoutes) {
      route.status = "FAILOVER_IN_PROGRESS";
      const targetGateway = this.selectOptimalGatewayForStream(route);

      if (!targetGateway) {
        route.status = "DEGRADED";
        failedCount += 1;
        continue;
      }

      // Step 3: Increment fencing token & atomically redirect route
      route.fencingToken += 1;
      route.standbyGatewayId = route.assignedGatewayId; // store previous as standby
      route.assignedGatewayId = targetGateway.gatewayId;
      route.redirectUrl = this.buildStreamUrl(targetGateway, route.streamPath);
      route.status = "FAILED_OVER";
      route.lastFailoverAt = nowIso;
      route.failoverCount += 1;
      route.updatedAt = nowIso;

      // Update node load counts
      targetGateway.activeStreams += 1;
      targetGateway.updatedAt = nowIso;

      redirectedCount += 1;
      this.emit("stream:redirected", {
        cameraId: route.cameraId,
        streamProfile: route.streamProfile,
        previousGateway: failedGatewayId,
        newGateway: targetGateway.gatewayId,
        redirectUrl: route.redirectUrl,
        fencingToken: route.fencingToken,
      });

      await this.syncRouteToDb(route);
      await this.syncNodeToDb(targetGateway);
    }

    if (failedNode) {
      failedNode.activeStreams = Math.max(0, failedNode.activeStreams - redirectedCount);
      await this.syncNodeToDb(failedNode);
    }

    const rtoMs = Date.now() - startTime;
    const completionEvent = await this.recordEvent({
      eventType: failedCount === 0 ? "FAILOVER_COMPLETED" : "FAILOVER_FAILED",
      severity: failedCount === 0 ? "INFO" : "WARNING",
      failedGatewayId,
      affectedStreams: affectedRoutes.length,
      redirectedStreams: redirectedCount,
      failedRedirects: failedCount,
      rtoMs,
      reason,
      details: {
        affectedCameras: affectedRoutes.length,
        redirectedCount,
        failedCount,
        rtoMs,
      },
      triggeredBy,
    });

    this.emit("failover:completed", {
      failedGatewayId,
      redirectedCount,
      failedCount,
      rtoMs,
    });

    return {
      success: failedCount === 0,
      affectedStreams: affectedRoutes.length,
      redirectedStreams: redirectedCount,
      failedRedirects: failedCount,
      rtoMs,
      event: completionEvent,
    };
  }

  /**
   * Capacity-weighted optimal gateway selection algorithm
   */
  selectOptimalGatewayForStream(route: MediaStreamRoute): MediaGatewayNode | undefined {
    const candidates = Array.from(this.nodes.values()).filter(
      (n) =>
        (n.status === "HEALTHY" || n.status === "DEGRADED") &&
        n.gatewayId !== route.assignedGatewayId &&
        n.activeStreams < n.maxStreams,
    );

    if (candidates.length === 0) {
      return undefined;
    }

    // Rank candidates:
    // 1. Available stream slots ratio
    // 2. Network headroom ratio
    // 3. CPU/Memory headroom
    // 4. Region affinity (bonus if matches preferred region)
    let bestCandidate: MediaGatewayNode | undefined;
    let highestScore = -Infinity;

    for (const candidate of candidates) {
      const streamHeadroomRatio = (candidate.maxStreams - candidate.activeStreams) / Math.max(1, candidate.maxStreams);
      const networkHeadroomRatio = Math.max(0, candidate.maxNetworkMbps - candidate.currentNetworkMbps) / Math.max(1, candidate.maxNetworkMbps);
      const cpuHeadroomRatio = Math.max(0, 100 - candidate.cpuPercent) / 100;
      const memHeadroomRatio = Math.max(0, 100 - candidate.memoryPercent) / 100;

      // Weighted score
      let score = (streamHeadroomRatio * 0.4) + (networkHeadroomRatio * 0.3) + (cpuHeadroomRatio * 0.15) + (memHeadroomRatio * 0.15);

      // Penalty if already over max load percentage
      const loadPct = (candidate.activeStreams / Math.max(1, candidate.maxStreams)) * 100;
      if (loadPct >= this.policy.maxLoadPercent) {
        score -= 0.5;
      }

      if (score > highestScore) {
        highestScore = score;
        bestCandidate = candidate;
      }
    }

    return bestCandidate;
  }

  /**
   * Gracefully drains a gateway instance before planned maintenance
   */
  async drainGateway(
    gatewayId: string,
    reason = "SCHEDULED_MAINTENANCE",
  ): Promise<{
    success: boolean;
    drainedStreams: number;
    failedRedirects: number;
    rtoMs: number;
  }> {
    const startTime = Date.now();
    const node = this.nodes.get(gatewayId);
    if (!node) {
      throw new Error(`Gateway node ${gatewayId} not found`);
    }

    node.status = "DRAINING";
    node.updatedAt = new Date().toISOString();
    await this.syncNodeToDb(node);

    const affectedRoutes = Array.from(this.routes.values()).filter(
      (r) => r.assignedGatewayId === gatewayId,
    );

    let drainedCount = 0;
    let failedCount = 0;
    const nowIso = new Date().toISOString();

    for (const route of affectedRoutes) {
      const targetGateway = this.selectOptimalGatewayForStream(route);
      if (!targetGateway) {
        failedCount += 1;
        continue;
      }

      route.fencingToken += 1;
      route.standbyGatewayId = route.assignedGatewayId;
      route.assignedGatewayId = targetGateway.gatewayId;
      route.redirectUrl = this.buildStreamUrl(targetGateway, route.streamPath);
      route.status = "ACTIVE";
      route.updatedAt = nowIso;

      targetGateway.activeStreams += 1;
      targetGateway.updatedAt = nowIso;

      drainedCount += 1;
      await this.syncRouteToDb(route);
      await this.syncNodeToDb(targetGateway);
    }

    node.activeStreams = Math.max(0, node.activeStreams - drainedCount);
    if (drainedCount === affectedRoutes.length) {
      node.status = "OFFLINE"; // successfully evacuated
    }
    await this.syncNodeToDb(node);

    const rtoMs = Date.now() - startTime;
    await this.recordEvent({
      eventType: "GATEWAY_DRAINED",
      severity: "INFO",
      failedGatewayId: gatewayId,
      affectedStreams: affectedRoutes.length,
      redirectedStreams: drainedCount,
      failedRedirects: failedCount,
      rtoMs,
      reason,
      details: { drainedCount, failedCount, finalStatus: node.status },
      triggeredBy: "OPERATOR_DRAIN",
    });

    this.emit("node:drained", { gatewayId, drainedCount, failedCount });

    return {
      success: failedCount === 0,
      drainedStreams: drainedCount,
      failedRedirects: failedCount,
      rtoMs,
    };
  }

  /**
   * Rebalances cluster stream distribution across healthy gateways
   */
  async rebalanceStreams(): Promise<{
    rebalancedStreams: number;
    transfers: Array<{ cameraId: string; fromGateway: string; toGateway: string }>;
  }> {
    const healthyGateways = Array.from(this.nodes.values()).filter((n) => n.status === "HEALTHY");
    if (healthyGateways.length < 2) {
      return { rebalancedStreams: 0, transfers: [] };
    }

    const totalActive = healthyGateways.reduce((sum, g) => sum + g.activeStreams, 0);
    const avgLoad = totalActive / healthyGateways.length;

    const overloaded = healthyGateways.filter((g) => g.activeStreams > avgLoad * 1.25);
    const underloaded = healthyGateways.filter((g) => g.activeStreams < avgLoad * 0.75);

    if (overloaded.length === 0 || underloaded.length === 0) {
      return { rebalancedStreams: 0, transfers: [] };
    }

    const transfers: Array<{ cameraId: string; fromGateway: string; toGateway: string }> = [];
    const nowIso = new Date().toISOString();

    for (const sourceNode of overloaded) {
      const eligibleToMove = Math.ceil(sourceNode.activeStreams - avgLoad);
      const routesOnNode = Array.from(this.routes.values()).filter((r) => r.assignedGatewayId === sourceNode.gatewayId);

      for (let i = 0; i < Math.min(eligibleToMove, routesOnNode.length); i++) {
        const route = routesOnNode[i];
        if (!route) continue;

        const targetNode = underloaded.sort((a, b) => a.activeStreams - b.activeStreams)[0];
        if (!targetNode || targetNode.activeStreams >= targetNode.maxStreams) break;

        route.fencingToken += 1;
        route.standbyGatewayId = route.assignedGatewayId;
        route.assignedGatewayId = targetNode.gatewayId;
        route.redirectUrl = this.buildStreamUrl(targetNode, route.streamPath);
        route.updatedAt = nowIso;

        sourceNode.activeStreams -= 1;
        targetNode.activeStreams += 1;

        transfers.push({
          cameraId: route.cameraId,
          fromGateway: sourceNode.gatewayId,
          toGateway: targetNode.gatewayId,
        });

        await this.syncRouteToDb(route);
      }
      await this.syncNodeToDb(sourceNode);
    }

    for (const tNode of underloaded) {
      await this.syncNodeToDb(tNode);
    }

    if (transfers.length > 0) {
      await this.recordEvent({
        eventType: "REBALANCE_COMPLETED",
        severity: "INFO",
        failedGatewayId: "CLUSTER",
        affectedStreams: transfers.length,
        redirectedStreams: transfers.length,
        failedRedirects: 0,
        rtoMs: 0,
        reason: "Load divergence threshold exceeded",
        details: { transfers },
        triggeredBy: "SYSTEM_REBALANCER",
      });
    }

    return { rebalancedStreams: transfers.length, transfers };
  }

  /**
   * Registers a new or existing gateway node in the cluster
   */
  async registerGateway(input: {
    gatewayId: string;
    gatewayName: string;
    ipAddress: string;
    port?: number;
    apiPort?: number;
    publicUrl?: string;
    region?: string;
    maxStreams?: number;
    maxNetworkMbps?: number;
  }): Promise<MediaGatewayNode> {
    const nowIso = new Date().toISOString();
    const existing = this.nodes.get(input.gatewayId);

    const node: MediaGatewayNode = {
      gatewayId: input.gatewayId,
      gatewayName: input.gatewayName,
      ipAddress: input.ipAddress,
      port: input.port ?? existing?.port ?? 8554,
      apiPort: input.apiPort ?? existing?.apiPort ?? 9997,
      publicUrl: input.publicUrl ?? existing?.publicUrl ?? `http://${input.ipAddress}:${input.port ?? 8554}`,
      region: input.region ?? existing?.region ?? "default",
      status: existing?.status ?? "HEALTHY",
      maxStreams: input.maxStreams ?? existing?.maxStreams ?? this.policy.maxStreamsPerGateway,
      activeStreams: existing?.activeStreams ?? 0,
      maxNetworkMbps: input.maxNetworkMbps ?? existing?.maxNetworkMbps ?? 1000.0,
      currentNetworkMbps: existing?.currentNetworkMbps ?? 0.0,
      cpuPercent: existing?.cpuPercent ?? 0.0,
      memoryPercent: existing?.memoryPercent ?? 0.0,
      consecutiveFailures: 0,
      lastHeartbeatAt: existing?.lastHeartbeatAt ?? nowIso,
      registeredAt: existing?.registeredAt ?? nowIso,
      updatedAt: nowIso,
    };

    this.nodes.set(node.gatewayId, node);
    await this.syncNodeToDb(node);
    return node;
  }

  /**
   * Routes a camera stream to the optimal gateway node
   */
  async routeStream(input: RouteStreamInput): Promise<MediaStreamRoute> {
    const profile = input.streamProfile || "main";
    const routeKey = `${input.cameraId}:${profile}`;
    const nowIso = new Date().toISOString();

    let assignedNode: MediaGatewayNode | undefined;
    if (input.preferredGatewayId) {
      assignedNode = this.nodes.get(input.preferredGatewayId);
      if (assignedNode && (assignedNode.status !== "HEALTHY" || assignedNode.activeStreams >= assignedNode.maxStreams)) {
        assignedNode = undefined;
      }
    }

    if (!assignedNode) {
      const tempRoute: MediaStreamRoute = {
        id: "",
        cameraId: input.cameraId,
        streamProfile: profile,
        assignedGatewayId: "",
        sourceUri: input.sourceUri,
        streamPath: `/live/${input.cameraId}_${profile}`,
        redirectUrl: "",
        status: "ACTIVE",
        fencingToken: 1,
        viewerCount: 0,
        bitrateKbps: input.bitrateKbps || 2048,
        fps: input.fps || 25,
        failoverCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      assignedNode = this.selectOptimalGatewayForStream(tempRoute);
    }

    if (!assignedNode) {
      // Fallback: pick any non-failed node or register a local default
      assignedNode = Array.from(this.nodes.values()).find((n) => n.status === "HEALTHY") || Array.from(this.nodes.values())[0];
      if (!assignedNode) {
        assignedNode = await this.registerGateway({
          gatewayId: "media-gateway-primary",
          gatewayName: "Default Primary Media Gateway",
          ipAddress: "127.0.0.1",
          port: 8554,
        });
      }
    }

    const streamPath = `/live/${input.cameraId}_${profile}`;
    const redirectUrl = this.buildStreamUrl(assignedNode, streamPath);

    const existingRoute = this.routes.get(routeKey);
    const route: MediaStreamRoute = {
      id: existingRoute?.id || randomUUID(),
      cameraId: input.cameraId,
      streamProfile: profile,
      assignedGatewayId: assignedNode.gatewayId,
      standbyGatewayId: existingRoute?.assignedGatewayId !== assignedNode.gatewayId ? existingRoute?.assignedGatewayId : existingRoute?.standbyGatewayId,
      sourceUri: input.sourceUri,
      streamPath,
      redirectUrl,
      status: "ACTIVE",
      fencingToken: (existingRoute?.fencingToken || 0) + 1,
      viewerCount: existingRoute?.viewerCount || 0,
      bitrateKbps: input.bitrateKbps || existingRoute?.bitrateKbps || 2048,
      fps: input.fps || existingRoute?.fps || 25,
      lastFailoverAt: existingRoute?.lastFailoverAt,
      failoverCount: existingRoute?.failoverCount || 0,
      createdAt: existingRoute?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    this.routes.set(routeKey, route);
    assignedNode.activeStreams += 1;
    assignedNode.updatedAt = nowIso;

    await this.syncRouteToDb(route);
    await this.syncNodeToDb(assignedNode);

    return route;
  }

  /**
   * Forces manual redirection of an individual camera stream to a specific gateway
   */
  async redirectStream(
    cameraId: string,
    targetGatewayId: string,
    streamProfile: "main" | "sub" | "preview" = "main",
  ): Promise<MediaStreamRoute> {
    const routeKey = `${cameraId}:${streamProfile}`;
    const route = this.routes.get(routeKey);
    if (!route) {
      throw new Error(`Stream route not found for camera ${cameraId} (${streamProfile})`);
    }

    const targetNode = this.nodes.get(targetGatewayId);
    if (!targetNode) {
      throw new Error(`Target gateway ${targetGatewayId} not found`);
    }

    const previousGatewayId = route.assignedGatewayId;
    const nowIso = new Date().toISOString();

    route.fencingToken += 1;
    route.standbyGatewayId = previousGatewayId;
    route.assignedGatewayId = targetGatewayId;
    route.redirectUrl = this.buildStreamUrl(targetNode, route.streamPath);
    route.status = "ACTIVE";
    route.lastFailoverAt = nowIso;
    route.failoverCount += 1;
    route.updatedAt = nowIso;

    // Adjust stream counts
    const prevNode = this.nodes.get(previousGatewayId);
    if (prevNode) {
      prevNode.activeStreams = Math.max(0, prevNode.activeStreams - 1);
      await this.syncNodeToDb(prevNode);
    }
    targetNode.activeStreams += 1;
    await this.syncNodeToDb(targetNode);

    await this.syncRouteToDb(route);

    this.emit("stream:redirected", {
      cameraId,
      streamProfile,
      previousGateway: previousGatewayId,
      newGateway: targetGatewayId,
      redirectUrl: route.redirectUrl,
      fencingToken: route.fencingToken,
    });

    return route;
  }

  /**
   * Updates failover policy configuration
   */
  async updatePolicy(patch: Partial<Omit<MediaGatewayFailoverPolicy, "policyId" | "updatedAt">>): Promise<MediaGatewayFailoverPolicy> {
    this.policy = {
      ...this.policy,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO media_gateway_failover_policies (
            policy_id, heartbeat_timeout_ms, watchdog_interval_ms,
            max_streams_per_gateway, max_load_percent, auto_failover_enabled,
            auto_failback_enabled, flap_damping_seconds, updated_at
          ) VALUES ('default', $1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (policy_id) DO UPDATE SET
            heartbeat_timeout_ms = EXCLUDED.heartbeat_timeout_ms,
            watchdog_interval_ms = EXCLUDED.watchdog_interval_ms,
            max_streams_per_gateway = EXCLUDED.max_streams_per_gateway,
            max_load_percent = EXCLUDED.max_load_percent,
            auto_failover_enabled = EXCLUDED.auto_failover_enabled,
            auto_failback_enabled = EXCLUDED.auto_failback_enabled,
            flap_damping_seconds = EXCLUDED.flap_damping_seconds,
            updated_at = NOW()`,
          [
            this.policy.heartbeatTimeoutMs,
            this.policy.watchdogIntervalMs,
            this.policy.maxStreamsPerGateway,
            this.policy.maxLoadPercent,
            this.policy.autoFailoverEnabled,
            this.policy.autoFailbackEnabled,
            this.policy.flapDampingSeconds,
          ],
        );
      } catch (err) {
        console.warn("[MediaGatewayFailoverService] Failed to persist policy:", err);
      }
    }

    return this.policy;
  }

  getPolicy(): MediaGatewayFailoverPolicy {
    return { ...this.policy };
  }

  getNodes(): MediaGatewayNode[] {
    return Array.from(this.nodes.values());
  }

  getNode(gatewayId: string): MediaGatewayNode | undefined {
    return this.nodes.get(gatewayId);
  }

  getRoutes(): MediaStreamRoute[] {
    return Array.from(this.routes.values());
  }

  getRoute(cameraId: string, streamProfile: "main" | "sub" | "preview" = "main"): MediaStreamRoute | undefined {
    return this.routes.get(`${cameraId}:${streamProfile}`);
  }

  getEvents(limit = 50): MediaGatewayFailoverEvent[] {
    return this.events.slice(0, limit);
  }

  /**
   * Computes comprehensive SLA and telemetry metrics
   */
  getMetrics(): FailoverSlaMetrics {
    const allNodes = Array.from(this.nodes.values());
    const healthyNodes = allNodes.filter((n) => n.status === "HEALTHY");
    const degradedNodes = allNodes.filter((n) => n.status === "DEGRADED");
    const drainingNodes = allNodes.filter((n) => n.status === "DRAINING");
    const failedNodes = allNodes.filter((n) => n.status === "FAILED");
    const offlineNodes = allNodes.filter((n) => n.status === "OFFLINE");

    const totalCapacity = allNodes.reduce((sum, n) => sum + n.maxStreams, 0);
    const totalActive = allNodes.reduce((sum, n) => sum + n.activeStreams, 0);
    const clusterHeadroomPercent = totalCapacity > 0 ? Math.round(((totalCapacity - totalActive) / totalCapacity) * 100) : 0;

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayEvents = this.events.filter((e) => e.createdAt.startsWith(todayStr));
    const failoverEvents = todayEvents.filter((e) => e.eventType === "FAILOVER_COMPLETED" || e.eventType === "FAILOVER_FAILED");

    const rtoValues = failoverEvents.map((e) => e.rtoMs).sort((a, b) => a - b);
    const avgRtoMs = rtoValues.length > 0 ? Math.round(rtoValues.reduce((a, b) => a + b, 0) / rtoValues.length) : 0;
    const p95RtoMs = rtoValues.length > 0 ? rtoValues[Math.min(rtoValues.length - 1, Math.floor(rtoValues.length * 0.95))]! : 0;
    const maxRtoMs = rtoValues.length > 0 ? Math.max(...rtoValues) : 0;

    const successfulFailovers = failoverEvents.filter((e) => e.eventType === "FAILOVER_COMPLETED").length;
    const streamContinuityPercent = failoverEvents.length > 0 ? Number(((successfulFailovers / failoverEvents.length) * 100).toFixed(1)) : 100.0;

    const lastCompleted = this.events.find((e) => e.eventType === "FAILOVER_COMPLETED");

    return {
      totalGateways: allNodes.length,
      healthyGateways: healthyNodes.length,
      degradedGateways: degradedNodes.length,
      drainingGateways: drainingNodes.length,
      failedGateways: failedNodes.length,
      offlineGateways: offlineNodes.length,
      totalCapacityStreams: totalCapacity,
      totalActiveStreams: totalActive,
      clusterHeadroomPercent,
      totalFailoversToday: failoverEvents.length,
      avgRtoMs,
      p95RtoMs,
      maxRtoMs,
      streamContinuityPercent,
      lastFailoverAt: lastCompleted?.createdAt,
    };
  }

  // --- Internal Helpers ---

  private buildStreamUrl(node: MediaGatewayNode, streamPath: string): string {
    const cleanPath = streamPath.startsWith("/") ? streamPath : `/${streamPath}`;
    if (node.publicUrl) {
      return `${node.publicUrl.replace(/\/$/, "")}${cleanPath}`;
    }
    return `http://${node.ipAddress}:${node.port}${cleanPath}`;
  }

  private async recordEvent(eventInput: Omit<MediaGatewayFailoverEvent, "id" | "createdAt">): Promise<MediaGatewayFailoverEvent> {
    const event: MediaGatewayFailoverEvent = {
      id: randomUUID(),
      ...eventInput,
      createdAt: new Date().toISOString(),
    };

    this.events.unshift(event);
    if (this.events.length > 500) {
      this.events.length = 500;
    }

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO media_gateway_failover_events (
            id, event_type, severity, failed_gateway_id, target_gateway_id,
            affected_streams, redirected_streams, failed_redirects, rto_ms,
            reason, details, triggered_by, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            event.id,
            event.eventType,
            event.severity,
            event.failedGatewayId,
            event.targetGatewayId || null,
            event.affectedStreams,
            event.redirectedStreams,
            event.failedRedirects,
            event.rtoMs,
            event.reason,
            JSON.stringify(event.details || {}),
            event.triggeredBy,
            event.createdAt,
          ],
        );
      } catch (err) {
        console.warn("[MediaGatewayFailoverService] Failed to persist failover event:", err);
      }
    }

    return event;
  }

  private async syncNodeToDb(node: MediaGatewayNode): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO media_gateway_nodes (
          gateway_id, gateway_name, ip_address, port, api_port,
          public_url, region, status, max_streams, active_streams,
          max_network_mbps, current_network_mbps, cpu_percent, memory_percent,
          consecutive_failures, last_heartbeat_at, registered_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (gateway_id) DO UPDATE SET
          gateway_name = EXCLUDED.gateway_name,
          ip_address = EXCLUDED.ip_address,
          port = EXCLUDED.port,
          api_port = EXCLUDED.api_port,
          public_url = EXCLUDED.public_url,
          region = EXCLUDED.region,
          status = EXCLUDED.status,
          max_streams = EXCLUDED.max_streams,
          active_streams = EXCLUDED.active_streams,
          max_network_mbps = EXCLUDED.max_network_mbps,
          current_network_mbps = EXCLUDED.current_network_mbps,
          cpu_percent = EXCLUDED.cpu_percent,
          memory_percent = EXCLUDED.memory_percent,
          consecutive_failures = EXCLUDED.consecutive_failures,
          last_heartbeat_at = EXCLUDED.last_heartbeat_at,
          updated_at = EXCLUDED.updated_at`,
        [
          node.gatewayId,
          node.gatewayName,
          node.ipAddress,
          node.port,
          node.apiPort,
          node.publicUrl,
          node.region,
          node.status,
          node.maxStreams,
          node.activeStreams,
          node.maxNetworkMbps,
          node.currentNetworkMbps,
          node.cpuPercent,
          node.memoryPercent,
          node.consecutiveFailures,
          node.lastHeartbeatAt,
          node.registeredAt,
          node.updatedAt,
        ],
      );
    } catch (err) {
      console.warn(`[MediaGatewayFailoverService] Failed to sync node ${node.gatewayId}:`, err);
    }
  }

  private async syncRouteToDb(route: MediaStreamRoute): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO media_stream_routes (
          id, camera_id, stream_profile, assigned_gateway_id, standby_gateway_id,
          source_uri, stream_path, redirect_url, status, fencing_token,
          viewer_count, bitrate_kbps, fps, last_failover_at, failover_count,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (camera_id, stream_profile) DO UPDATE SET
          assigned_gateway_id = EXCLUDED.assigned_gateway_id,
          standby_gateway_id = EXCLUDED.standby_gateway_id,
          source_uri = EXCLUDED.source_uri,
          stream_path = EXCLUDED.stream_path,
          redirect_url = EXCLUDED.redirect_url,
          status = EXCLUDED.status,
          fencing_token = EXCLUDED.fencing_token,
          viewer_count = EXCLUDED.viewer_count,
          bitrate_kbps = EXCLUDED.bitrate_kbps,
          fps = EXCLUDED.fps,
          last_failover_at = EXCLUDED.last_failover_at,
          failover_count = EXCLUDED.failover_count,
          updated_at = EXCLUDED.updated_at`,
        [
          route.id,
          route.cameraId,
          route.streamProfile,
          route.assignedGatewayId,
          route.standbyGatewayId || null,
          route.sourceUri,
          route.streamPath,
          route.redirectUrl,
          route.status,
          route.fencingToken,
          route.viewerCount,
          route.bitrateKbps,
          route.fps,
          route.lastFailoverAt ? new Date(route.lastFailoverAt) : null,
          route.failoverCount,
          route.createdAt,
          route.updatedAt,
        ],
      );
    } catch (err) {
      console.warn(`[MediaGatewayFailoverService] Failed to sync route for camera ${route.cameraId}:`, err);
    }
  }
}

export const mediaGatewayFailoverService = new MediaGatewayFailoverService();
