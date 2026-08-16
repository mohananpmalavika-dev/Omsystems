/**
 * Live Session Service
 * 
 * Coordinates the creation, authorization, heartbeat maintenance, and termination
 * of temporary, on-demand live video sessions between operator browsers and branch edge gateways.
 */

import type { LiveSession, StreamQuality, SessionPurpose, BranchNetworkState, EdgeGatewayCapacity } from "../domain/media-session.types.js";
import { StreamProfileSelector } from "./stream-profile-selector.js";
import { edgeMediaProxyService, EdgeMediaProxyService } from "./edge-media-proxy.service.js";
import { videoAccessAuditService, VideoAccessAuditService } from "./video-access-audit.service.js";

export class LiveSessionService {
  private sessions: Map<string, LiveSession> = new Map();
  private sessionAuditMap: Map<string, string> = new Map(); // sessionId -> auditId
  private networkStates: Map<string, BranchNetworkState> = new Map(); // branchId -> network
  private gatewayCapacities: Map<string, EdgeGatewayCapacity> = new Map(); // gatewayId -> capacity

  constructor(
    private readonly proxy: EdgeMediaProxyService = edgeMediaProxyService,
    private readonly audit: VideoAccessAuditService = videoAccessAuditService
  ) {
    this.seedDefaultInfrastructure();
  }

  private seedDefaultInfrastructure() {
    this.networkStates.set("branch-178", {
      mode: "PRIMARY",
      uploadMbps: 50,
      latencyMs: 18,
      packetLossPct: 0.01,
    });

    this.gatewayCapacities.set("edge-gw-178", {
      gatewayId: "edge-gw-178",
      branchId: "branch-178",
      maxRtspInputs: 64,
      maxWebRtcOutputs: 32,
      maxTranscode1080p: 4,
      activeRtspInputs: 4,
      activeWebRtcOutputs: 2,
      activeTranscodes: 0,
      cpuPct: 28,
      memoryPct: 35,
      online: true,
    });
  }

  setBranchNetworkState(branchId: string, state: BranchNetworkState) {
    this.networkStates.set(branchId, state);
  }

  setEdgeGatewayCapacity(gatewayId: string, capacity: EdgeGatewayCapacity) {
    this.gatewayCapacities.set(gatewayId, capacity);
  }

  async createSession(options: {
    tenantId: string;
    branchId: string;
    cameraId: string;
    cameraName?: string | undefined;
    userId: string;
    purpose?: SessionPurpose | undefined;
    quality?: StreamQuality | undefined;
    sourceIp?: string | undefined;
    ttlMinutes?: number | undefined;
  }): Promise<LiveSession> {
    const id = `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const purpose = options.purpose || "LIVE_VIEW";
    const requestedQuality = options.quality || "AUTO";
    const network = this.networkStates.get(options.branchId);
    const edgeGatewayId = `edge-gw-${options.branchId.replace("branch-", "")}`;
    const gateway = this.gatewayCapacities.get(edgeGatewayId);

    // 1. Adaptive Quality Selection
    const { resolvedQuality, mediaMode } = StreamProfileSelector.select({
      requestedQuality,
      purpose,
      network,
      gateway,
    });

    // 2. Acquire from Edge Media Proxy with Reference Counting
    const { streamUrl } = await this.proxy.acquireStream(options.cameraId, resolvedQuality, id);

    const now = new Date();
    const ttlMinutes = options.ttlMinutes || 5;
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);

    const session: LiveSession = {
      id,
      tenantId: options.tenantId,
      branchId: options.branchId,
      cameraId: options.cameraId,
      cameraName: options.cameraName,
      requestedByUserId: options.userId,
      purpose,
      requestedQuality,
      resolvedQuality,
      protocol: "WEBRTC",
      mediaMode,
      state: "ACTIVE",
      edgeGatewayId,
      streamUrl,
      sessionToken: `token-${id}-${Math.random().toString(36).slice(2, 12)}`,
      createdAt: now,
      startedAt: now,
      lastActivityAt: now,
      expiresAt,
      metrics: {
        bitrateKbps: resolvedQuality === "MAINSTREAM" ? 2048 : 512,
        fps: 25,
        width: resolvedQuality === "MAINSTREAM" ? 1920 : 640,
        height: resolvedQuality === "MAINSTREAM" ? 1080 : 360,
        packetLossPct: 0.0,
        reconnectCount: 0,
      },
    };

    this.sessions.set(id, session);

    // 3. Audit video access
    const auditRecord = await this.audit.logAccess({
      userId: options.userId,
      tenantId: options.tenantId,
      branchId: options.branchId,
      cameraId: options.cameraId,
      action: "LIVE_START",
      purpose: `Live session created for purpose: ${purpose} (${resolvedQuality})`,
      sourceIp: options.sourceIp,
      startedAt: now,
    });
    this.sessionAuditMap.set(id, auditRecord.id);

    return session;
  }

  async heartbeat(sessionId: string, extensionSeconds = 300): Promise<LiveSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.state !== "ACTIVE") return null;

    const now = new Date();
    session.lastActivityAt = now;
    session.expiresAt = new Date(now.getTime() + extensionSeconds * 1000);
    return session;
  }

  async terminateSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.state = "STOPPED";

    // Release from edge proxy (triggers warm grace timer if last viewer)
    await this.proxy.releaseStream(session.cameraId, session.resolvedQuality, sessionId);

    // Close audit trail
    const auditId = this.sessionAuditMap.get(sessionId);
    if (auditId) {
      await this.audit.closeLiveSessionAudit(auditId);
      this.sessionAuditMap.delete(sessionId);
    }

    this.sessions.delete(sessionId);
    return true;
  }

  getSession(id: string): LiveSession | undefined {
    return this.sessions.get(id);
  }

  getActiveSessionsCount(): number {
    return this.sessions.size;
  }

  clear() {
    this.sessions.clear();
    this.sessionAuditMap.clear();
    this.proxy.clear();
    this.audit.clear();
  }
}

export const liveSessionService = new LiveSessionService();
