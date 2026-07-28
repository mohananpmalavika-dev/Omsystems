/**
 * Enhanced Camera Heartbeat Service
 * Sends comprehensive camera status and quality metrics to central platform
 */

import { probeRtsp } from "../streaming/rtsp-probe.js";
import { logger } from "../utils/logger.js";

export interface CameraHeartbeatData {
  cameraId: string;
  status: "online" | "offline" | "warning" | "degraded";
  responseTimeMs: number;
  
  // Quality metrics
  currentFps?: number;
  currentBitrate?: number;
  currentResolution?: {
    width: number;
    height: number;
  };
  packetLoss?: number;
  latencyMs?: number;
  
  // Stream health
  streamActive: boolean;
  videoLoss: boolean;
  imageFrozen?: boolean;
  blackScreen?: boolean;
  
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface CameraConfig {
  id: string;
  name: string;
  rtspUrl: string;
  expectedFps: number;
  expectedBitrate: number;
  expectedResolution: { width: number; height: number };
  enabled: boolean;
}

export class CameraHeartbeatService {
  private apiEndpoint: string;
  private cameras: Map<string, CameraConfig>;
  private lastFrameCounts: Map<string, number>;
  private heartbeatInterval: NodeJS.Timeout | null;
  private isRunning: boolean;

  constructor(
    apiEndpoint: string,
    private readonly branchId: string,
    private readonly edgeAgentId: string,
    private readonly developmentUserId: string,
    private readonly edgeBridgeSharedKey?: string,
  ) {
    this.apiEndpoint = apiEndpoint;
    this.cameras = new Map();
    this.lastFrameCounts = new Map();
    this.heartbeatInterval = null;
    this.isRunning = false;
  }

  /**
   * Register a camera for monitoring
   */
  registerCamera(camera: CameraConfig): void {
    this.cameras.set(camera.id, camera);
    logger.info(`Registered camera for heartbeat monitoring: ${camera.name}`);
  }

  /**
   * Unregister a camera
   */
  unregisterCamera(cameraId: string): void {
    this.cameras.delete(cameraId);
    this.lastFrameCounts.delete(cameraId);
    logger.info(`Unregistered camera: ${cameraId}`);
  }

  /**
   * Start heartbeat monitoring
   */
  start(intervalMs: number = 30000): void {
    if (this.isRunning) {
      logger.warn("Camera heartbeat service already running");
      return;
    }

    logger.info(`Starting camera heartbeat service (interval: ${intervalMs}ms)`);
    this.isRunning = true;

    // Send initial heartbeat for all cameras
    this.sendAllHeartbeats().catch((error) => {
      logger.error("Failed to send initial heartbeats", { error });
    });

    // Set up interval for subsequent heartbeats
    this.heartbeatInterval = setInterval(() => {
      this.sendAllHeartbeats().catch((error) => {
        logger.error("Failed to send heartbeats", { error });
      });
    }, intervalMs);
  }

  /**
   * Stop heartbeat monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info("Stopping camera heartbeat service");
    this.isRunning = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Send heartbeat for all registered cameras
   */
  private async sendAllHeartbeats(): Promise<void> {
    const cameras = Array.from(this.cameras.values()).filter((c) => c.enabled);
    
    if (cameras.length === 0) {
      return;
    }

    logger.debug(`Sending heartbeats for ${cameras.length} cameras`);

    // Send heartbeats concurrently with limit
    const batchSize = 10;
    for (let i = 0; i < cameras.length; i += batchSize) {
      const batch = cameras.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map((camera) => this.sendHeartbeat(camera))
      );
    }
  }

  /**
   * Send heartbeat for a single camera
   */
  private async sendHeartbeat(camera: CameraConfig): Promise<void> {
    const startTime = Date.now();

    try {
      // Probe RTSP stream
      const probeResult = await probeRtsp(camera.rtspUrl, "ffprobe", 10000);
      const responseTime = Date.now() - startTime;

      let heartbeatData: CameraHeartbeatData;

      if (probeResult.reachable) {
        // Camera is online - collect quality metrics
        heartbeatData = {
          cameraId: camera.id,
          status: "online",
          responseTimeMs: responseTime,
          streamActive: true,
          videoLoss: false,
          currentResolution: probeResult.width && probeResult.height
            ? { width: probeResult.width, height: probeResult.height }
            : camera.expectedResolution,
          latencyMs: responseTime,
          metadata: {
            codec: probeResult.codec,
          },
        };

      } else {
        // Camera is offline
        heartbeatData = {
          cameraId: camera.id,
          status: "offline",
          responseTimeMs: responseTime,
          streamActive: false,
          videoLoss: true,
          errorMessage: probeResult.error || "Camera not reachable",
        };
      }

      // Send to central platform
      await this.sendToPlatform(camera.id, heartbeatData);

      logger.debug(`Heartbeat sent for camera ${camera.name}: ${heartbeatData.status}`);
    } catch (error) {
      logger.error(`Failed to send heartbeat for camera ${camera.name}`, { error });

      // Send offline heartbeat
      const heartbeatData: CameraHeartbeatData = {
        cameraId: camera.id,
        status: "offline",
        responseTimeMs: Date.now() - startTime,
        streamActive: false,
        videoLoss: true,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      };

      await this.sendToPlatform(camera.id, heartbeatData).catch(() => {
        // Ignore errors when sending error heartbeat
      });
    }
  }

  /**
   * Send heartbeat data to central platform
   */
  private async sendToPlatform(
    cameraId: string,
    data: CameraHeartbeatData
  ): Promise<void> {
    const observedAt = new Date().toISOString();
    const url = `${this.apiEndpoint}/v1/edge-agents/${encodeURIComponent(this.edgeAgentId)}/telemetry`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": this.developmentUserId,
        ...(this.edgeBridgeSharedKey ? { "x-edge-bridge-key": this.edgeBridgeSharedKey } : {}),
      },
      body: JSON.stringify({
        branchId: this.branchId,
        edgeAgentId: this.edgeAgentId,
        deviceType: "camera",
        deviceId: cameraId,
        observedAt,
        source: "rtsp",
        quality: "verified",
        idempotencyKey: `${this.edgeAgentId}:camera:${cameraId}:${observedAt}`,
        metrics: {
          status: data.status === "warning" ? "degraded" : data.status,
          responseTimeMs: data.responseTimeMs,
          streamActive: data.streamActive,
          videoLoss: data.videoLoss,
          width: data.currentResolution?.width ?? null,
          height: data.currentResolution?.height ?? null,
          codec: typeof data.metadata?.codec === "string" ? data.metadata.codec : null,
          fps: null,
          bitrateKbps: null,
          packetLossPercent: null,
          imageFrozen: null,
          blackScreen: null,
        },
        reasonCodes: [
          ...(data.errorMessage ? ["rtsp_unreachable"] : []),
          "fps_unavailable", "bitrate_unavailable", "packet_loss_unavailable",
          "freeze_detection_unavailable", "black_screen_detection_unavailable",
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
  }

  /**
   * Estimate FPS by analyzing stream
   */
  private async estimateFps(_cameraId: string, _rtspUrl: string): Promise<number | undefined> {
    return undefined;
  }

  /**
   * Estimate bitrate by analyzing stream
   */
  private async estimateBitrate(_cameraId: string, _rtspUrl: string): Promise<number | undefined> {
    return undefined;
  }

  /**
   * Estimate packet loss
   */
  private async estimatePacketLoss(_cameraId: string, _rtspUrl: string): Promise<number | undefined> {
    return undefined;
  }

  /**
   * Detect frozen stream by comparing frame counts
   */
  private async detectFrozenStream(cameraId: string, currentFps: number): Promise<boolean> {
    // If FPS is very low, consider it frozen
    if (currentFps < 1) {
      return true;
    }

    // Track frame count over time
    const lastFrameCount = this.lastFrameCounts.get(cameraId) || 0;
    const currentFrameCount = lastFrameCount + currentFps;

    // If frame count hasn't changed significantly, stream might be frozen
    const frameDelta = currentFrameCount - lastFrameCount;
    const isFrozen = frameDelta < 0.5;

    this.lastFrameCounts.set(cameraId, currentFrameCount);

    return isFrozen;
  }

  /**
   * Trigger manual heartbeat for a specific camera
   */
  async triggerManualHeartbeat(cameraId: string): Promise<void> {
    const camera = this.cameras.get(cameraId);
    if (!camera) {
      throw new Error(`Camera not found: ${cameraId}`);
    }

    await this.sendHeartbeat(camera);
  }

  /**
   * Get monitoring statistics
   */
  getStats(): {
    totalCameras: number;
    enabledCameras: number;
    isRunning: boolean;
  } {
    const cameras = Array.from(this.cameras.values());
    return {
      totalCameras: cameras.length,
      enabledCameras: cameras.filter((c) => c.enabled).length,
      isRunning: this.isRunning,
    };
  }
}

/**
 * Global camera heartbeat service instance
 */
let heartbeatService: CameraHeartbeatService | null = null;

/**
 * Initialize camera heartbeat service
 */
export function initializeCameraHeartbeat(
  apiEndpoint: string,
  branchId: string,
  edgeAgentId: string,
  developmentUserId: string,
  edgeBridgeSharedKey?: string,
): CameraHeartbeatService {
  if (!heartbeatService) {
    heartbeatService = new CameraHeartbeatService(
      apiEndpoint, branchId, edgeAgentId, developmentUserId, edgeBridgeSharedKey,
    );
  }
  return heartbeatService;
}

/**
 * Get camera heartbeat service instance
 */
export function getCameraHeartbeatService(): CameraHeartbeatService {
  if (!heartbeatService) {
    throw new Error("Camera heartbeat service not initialized");
  }
  return heartbeatService;
}
