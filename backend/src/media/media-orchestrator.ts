/**
 * Media Orchestrator
 * Central coordination of decoder budgets, stream scheduling, policy enforcement, and session management
 */

import { logger } from "../utils/logger.js";
import { DecoderBudgetManager } from "./decoder-budget-manager.js";
import { StreamScheduler } from "./stream-scheduler.js";
import { MediaSessionService } from "./media-session.service.js";
import { MediaPolicyService } from "./media-policy.service.js";
import type {
  ClientMediaCapabilities,
  CreateMediaSessionRequest,
  StreamAllocationRequest,
  VideoProfile,
  CameraStreamCapabilities,
  MediaSession,
  SequencePolicy,
  BranchMediaCapacity,
  MonitoringProfile,
  PlatformCapacityMetrics,
  WorkstationCapacityMetrics,
  CameraMediaState,
} from "./types.js";

export interface MediaOrchestratorOptions {
  maxConcurrentStreams?: number;
  defaultSessionTTLSeconds?: number;
  platformMaxBandwidthMbps?: number;
}

/**
 * Central media orchestration service
 * Coordinates all aspects of enterprise video streaming
 */
export class MediaOrchestrator {
  private decoderManagers: Map<string, DecoderBudgetManager> = new Map(); // userId -> manager
  private schedulers: Map<string, StreamScheduler> = new Map(); // userId -> scheduler
  private sessionService: MediaSessionService;
  private policyService: MediaPolicyService;
  private cameraCapabilities: Map<string, CameraStreamCapabilities> = new Map();
  private readonly maxConcurrentStreams: number;

  constructor(options: MediaOrchestratorOptions = {}) {
    this.maxConcurrentStreams = options.maxConcurrentStreams || 36;
    
    this.sessionService = new MediaSessionService({
      defaultSessionTTLSeconds: options.defaultSessionTTLSeconds,
    });

    this.policyService = new MediaPolicyService({
      platformMaxBandwidthMbps: options.platformMaxBandwidthMbps,
    });

    logger.info("Media orchestrator initialized", {
      maxConcurrentStreams: this.maxConcurrentStreams,
    });
  }

  /**
   * Register client capabilities and get/create decoder manager
   */
  registerClient(
    userId: string,
    capabilities: ClientMediaCapabilities
  ): DecoderBudgetManager {
    let manager = this.decoderManagers.get(userId);
    
    if (!manager) {
      manager = new DecoderBudgetManager(capabilities, this.maxConcurrentStreams);
      this.decoderManagers.set(userId, manager);

      // Create scheduler for this user
      const scheduler = new StreamScheduler({
        decoderBudgetManager: manager,
      });
      this.schedulers.set(userId, scheduler);

      logger.info("Client registered", {
        userId,
        decodeClass: capabilities.estimatedDecodeClass,
        maxDecoders: manager.getBudget().maxActiveDecoders,
      });
    } else {
      // Refresh existing manager with new capabilities
      manager.refresh(capabilities);
    }

    return manager;
  }

  /**
   * Register camera stream capabilities
   */
  registerCameraCapabilities(capabilities: CameraStreamCapabilities): void {
    this.cameraCapabilities.set(capabilities.cameraId, capabilities);
    logger.debug("Camera capabilities registered", {
      cameraId: capabilities.cameraId,
      mainStream: `${capabilities.mainStream.width}x${capabilities.mainStream.height}`,
      hasSubStream: !!capabilities.subStream,
    });
  }

  /**
   * Update branch media capacity
   */
  updateBranchCapacity(capacity: BranchMediaCapacity): void {
    this.policyService.updateBranchCapacity(capacity);
  }

  /**
   * Set user monitoring profile
   */
  setMonitoringProfile(profile: MonitoringProfile): void {
    this.policyService.setMonitoringProfile(profile);
  }

  /**
   * Request media session with full orchestration
   */
  async requestMediaSession(
    request: CreateMediaSessionRequest,
    branchId: string,
    clientCapabilities?: ClientMediaCapabilities
  ): Promise<{
    session: MediaSession | null;
    reason: string;
    degraded: boolean;
  }> {
    // Register client if capabilities provided
    if (clientCapabilities) {
      this.registerClient(request.userId, clientCapabilities);
    }

    // Get scheduler for user
    const scheduler = this.schedulers.get(request.userId);
    if (!scheduler) {
      return {
        session: null,
        reason: "Client not registered. Please provide client capabilities.",
        degraded: false,
      };
    }

    // Get camera capabilities
    const cameraCapabilities = this.cameraCapabilities.get(request.cameraId);
    if (!cameraCapabilities) {
      return {
        session: null,
        reason: "Camera capabilities not available",
        degraded: false,
      };
    }

    // Determine requested profile
    const { mainStream, subStream } = cameraCapabilities;
    let requestedProfile: VideoProfile;
    let alternativeProfile: VideoProfile | undefined;

    if (request.preferredQuality === "MAINSTREAM" || request.purpose === "INVESTIGATION") {
      requestedProfile = mainStream;
      alternativeProfile = subStream;
    } else {
      requestedProfile = subStream || mainStream;
      alternativeProfile = subStream ? undefined : undefined;
    }

    // Check policy
    const userSessions = this.sessionService.getSessionsForUser(request.userId);
    const currentUserMainStreams = userSessions.filter(
      (s) => s.profile.width > 1280
    ).length;

    const branchSessions = Array.from(this.sessionService.getActiveSessions())
      .filter((s) => {
        const cam = this.cameraCapabilities.get(s.cameraId);
        // Would need to map camera to branch - simplified here
        return false;
      }).length;

    const policyDecision = this.policyService.evaluatePolicy({
      branchId,
      userId: request.userId,
      cameraId: request.cameraId,
      purpose: request.purpose,
      requestedProfile,
      alternativeProfile,
      currentBranchSessions: branchSessions,
      currentUserMainStreams,
    });

    if (!policyDecision.allowed) {
      logger.warn("Media session rejected by policy", {
        cameraId: request.cameraId,
        userId: request.userId,
        reason: policyDecision.reason,
      });

      return {
        session: null,
        reason: policyDecision.reason,
        degraded: false,
      };
    }

    // Use policy-suggested profile
    const selectedProfile = policyDecision.suggestedProfile || requestedProfile;
    const degraded = selectedProfile !== requestedProfile;

    // Request allocation from scheduler
    const allocationRequest: StreamAllocationRequest = {
      cameraId: request.cameraId,
      userId: request.userId,
      tenantId: request.tenantId,
      purpose: request.purpose,
      priority: request.priority || 0,
      requestedQuality: request.preferredQuality,
      visibleInViewport: true, // Would come from client
    };

    const allocation = await scheduler.requestAllocation(allocationRequest, {
      main: mainStream,
      sub: subStream,
    });

    if (!allocation.allocated) {
      logger.warn("Stream allocation failed", {
        cameraId: request.cameraId,
        reason: allocation.reason,
      });

      return {
        session: null,
        reason: allocation.reason,
        degraded: false,
      };
    }

    // Reserve bandwidth
    const bandwidthReserved = this.policyService.reserveBandwidth(
      branchId,
      policyDecision.estimatedBandwidthMbps || 3
    );

    if (!bandwidthReserved) {
      // Rollback allocation
      scheduler.releaseAllocation(request.cameraId);

      return {
        session: null,
        reason: "Failed to reserve branch bandwidth",
        degraded: false,
      };
    }

    // Create session
    const session = await this.sessionService.createSession(
      request,
      allocation.profile!,
      branchId // Using branchId as gatewayId for simplicity
    );

    // Update session state to connecting
    this.sessionService.updateSessionState(session.id, "CONNECTING");

    logger.info("Media session created", {
      sessionId: session.id,
      cameraId: request.cameraId,
      userId: request.userId,
      profile: `${session.profile.width}x${session.profile.height}@${session.profile.fps}fps`,
      degraded,
    });

    return {
      session,
      reason: "Session created successfully",
      degraded,
    };
  }

  /**
   * Close media session with cleanup
   */
  async closeMediaSession(
    sessionId: string
  ): Promise<boolean> {
    const session = this.sessionService.getSession(sessionId);
    if (!session) {
      return false;
    }

    // Release scheduler allocation
    const scheduler = this.schedulers.get(session.userId);
    if (scheduler) {
      scheduler.releaseAllocation(session.cameraId);
    }

    // Release bandwidth
    if (session.gatewayId) {
      const bandwidth = this.policyService["estimateProfileBandwidth"](session.profile);
      this.policyService.releaseBandwidth(session.gatewayId, bandwidth);
    }

    // Close session
    return this.sessionService.closeSession(sessionId);
  }

  /**
   * Process session heartbeat
   */
  processHeartbeat(sessionId: string): boolean {
    return this.sessionService.processHeartbeat({
      sessionId,
      timestamp: new Date(),
      active: true,
    });
  }

  /**
   * Update camera media state (from digital twin)
   */
  updateCameraState(state: CameraMediaState): void {
    // Update all schedulers
    for (const scheduler of this.schedulers.values()) {
      scheduler.updateCameraState(state);
    }
  }

  /**
   * Update sequence policy for user
   */
  updateSequencePolicy(userId: string, policy: SequencePolicy): void {
    const scheduler = this.schedulers.get(userId);
    if (scheduler) {
      scheduler.updateSequencePolicy(policy);
    }
  }

  /**
   * Get platform capacity metrics
   */
  getPlatformMetrics(): PlatformCapacityMetrics {
    const sessionMetrics = this.sessionService.getMetrics();
    const policyMetrics = this.policyService.getMetrics();

    // Would integrate with device registry for real counts
    return {
      branchesEnrolled: policyMetrics.totalBranches,
      camerasEnrolled: this.cameraCapabilities.size,
      camerasCurrentlyOnline: this.cameraCapabilities.size, // Simplified
      activeHoMediaSessions: sessionMetrics.activeSessions,
      activeMainStreams: sessionMetrics.activeSessions, // Would filter by profile
      activeSubstreams: 0,
      currentHoBandwidthMbps: policyMetrics.totalBandwidthMbps,
      configuredMediaBudgetMbps: 500, // Would come from config
    };
  }

  /**
   * Get workstation capacity metrics for user
   */
  getWorkstationMetrics(userId: string): WorkstationCapacityMetrics | null {
    const manager = this.decoderManagers.get(userId);
    const scheduler = this.schedulers.get(userId);

    if (!manager || !scheduler) {
      return null;
    }

    const decoderMetrics = manager.getMetrics();
    const schedulerMetrics = scheduler.getMetrics();

    return {
      gridPositions: 144, // Would come from user session
      activeDecoders: decoderMetrics.activeDecoders,
      liveCameras: schedulerMetrics.allocatedStreams,
      snapshotCameras: 0, // Would track separately
      decoderLoadPercent: decoderMetrics.utilizationPercent,
      estimatedCapacityClass: "STANDARD", // Would come from client capabilities
    };
  }

  /**
   * Cleanup and destroy orchestrator
   */
  destroy(): void {
    this.sessionService.destroy();
    this.decoderManagers.clear();
    this.schedulers.clear();
    this.cameraCapabilities.clear();
    logger.info("Media orchestrator destroyed");
  }
}

/**
 * Global orchestrator instance
 */
let orchestrator: MediaOrchestrator | null = null;

/**
 * Get or create orchestrator instance
 */
export function getMediaOrchestrator(
  options?: MediaOrchestratorOptions
): MediaOrchestrator {
  if (!orchestrator) {
    orchestrator = new MediaOrchestrator(options);
  }
  return orchestrator;
}
