import { randomUUID } from "node:crypto";
import type {
  ViewerSession,
  ViewerTelemetry,
  StreamLease,
} from "../domain/distributed-lease.types.js";
import { ViewerStreamScheduler, type ViewerGridState, type ScheduledViewerCamera } from "./viewer-stream-scheduler.js";
import { GlobalStreamCoordinator } from "./global-stream-coordinator.js";
import type { ViewerSessionRepository } from "../domain/viewer-session-repository.contract.js";
import type { CameraCapabilityRepository } from "../domain/camera-capability-repository.contract.js";
import type { MediaGatewayRegistry } from "../domain/media-gateway-registry.contract.js";
import type { StreamLeaseRepository } from "../domain/stream-lease-repository.contract.js";

export interface ViewerScheduleResult {
  sessionId: string;
  totalCameras: number;
  liveStreamsScheduled: number;
  lowFpsScheduled: number;
  deferredScheduled: number;
  cameras: Record<string, ScheduledViewerCamera & { relayUrl?: string }>;
}

export class MediaOrchestrator {
  private readonly viewerScheduler = new ViewerStreamScheduler();
  readonly globalCoordinator: GlobalStreamCoordinator;

  // Local ephemeral Map for WebSocket/connection references attached to this specific node
  private readonly localActiveWebSockets = new Map<string, any>();

  constructor(
    readonly leaseRepository: StreamLeaseRepository,
    readonly gatewayRegistry: MediaGatewayRegistry,
    readonly sessionRepository: ViewerSessionRepository,
    readonly capabilityRepository: CameraCapabilityRepository,
  ) {
    this.globalCoordinator = new GlobalStreamCoordinator(
      leaseRepository,
      gatewayRegistry,
      capabilityRepository,
    );
  }

  /**
   * Register a new viewer session with TTL in Redis.
   */
  async createViewerSession(
    userId: string,
    tenantId: string,
    deviceType: ViewerSession["deviceType"] = "workstation",
    activeLayout = "4x4",
  ): Promise<ViewerSession> {
    const sessionId = randomUUID();
    const now = Date.now();
    const session: ViewerSession = {
      sessionId,
      userId,
      tenantId,
      deviceType,
      activeLayout,
      createdAt: now,
      lastHeartbeatAt: now,
    };

    await this.sessionRepository.registerSession(session, 60);
    return session;
  }

  /**
   * Report browser decode telemetry (hardware decode, active decoders, screen viewport).
   */
  async reportTelemetry(telemetry: ViewerTelemetry): Promise<void> {
    await this.sessionRepository.updateTelemetry(telemetry, 60);
  }

  /**
   * Run the full multi-tier scheduling pass for a browser / video wall:
   * 1. Uses ViewerStreamScheduler to optimize local tile allocations based on viewport and client GPU.
   * 2. Uses GlobalStreamCoordinator to acquire or reuse distributed stream leases in Redis.
   */
  async scheduleViewerGrid(
    sessionId: string,
    cameras: { id: string; name?: string; isOnline?: boolean }[],
    grid: Omit<ViewerGridState, "sessionId">,
  ): Promise<ViewerScheduleResult> {
    const fullGridState: ViewerGridState = {
      ...grid,
      sessionId,
    };

    // 1. Fetch latest client hardware telemetry from Redis / memory
    const telemetry = await this.sessionRepository.getTelemetry(sessionId);

    // 2. Perform local viewport optimization
    const scheduleMap = this.viewerScheduler.calculateViewerSchedule(
      cameras,
      fullGridState,
      telemetry || undefined,
    );

    const resultCameras: Record<string, ScheduledViewerCamera & { relayUrl?: string }> = {};
    let liveCount = 0;
    let lowFpsCount = 0;
    let deferredCount = 0;

    // 3. For live video cameras, acquire or reuse cluster stream leases
    for (const [cameraId, scheduled] of scheduleMap.entries()) {
      if (scheduled.playbackMode === "live_video" && !scheduled.isPaused) {
        liveCount++;
        try {
          const lease = await this.globalCoordinator.acquireStream(
            cameraId,
            sessionId,
            scheduled.streamProfile,
          );
          resultCameras[cameraId] = {
            ...scheduled,
            relayUrl: lease.relayUrl,
          };
        } catch (err) {
          // If cluster lease acquisition failed, degrade gracefully to preview mode
          resultCameras[cameraId] = {
            ...scheduled,
            playbackMode: "low_fps_preview",
          };
        }
      } else if (scheduled.playbackMode === "low_fps_preview") {
        lowFpsCount++;
        resultCameras[cameraId] = scheduled;
      } else {
        deferredCount++;
        resultCameras[cameraId] = scheduled;
      }
    }

    return {
      sessionId,
      totalCameras: cameras.length,
      liveStreamsScheduled: liveCount,
      lowFpsScheduled: lowFpsCount,
      deferredScheduled: deferredCount,
      cameras: resultCameras,
    };
  }

  /**
   * Release a single camera stream for a viewer.
   */
  async releaseCameraStream(
    cameraId: string,
    sessionId: string,
    streamProfile = "main",
  ): Promise<boolean> {
    return this.globalCoordinator.releaseStream(cameraId, sessionId, streamProfile);
  }

  /**
   * Close a viewer session and release all associated stream allocations.
   */
  async closeViewerSession(sessionId: string): Promise<void> {
    await this.sessionRepository.removeSession(sessionId);
  }
}
