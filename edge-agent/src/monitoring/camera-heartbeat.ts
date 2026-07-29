/**
 * Edge-side camera telemetry. All reported quality values are measured from
 * the local RTSP stream or the local camera network path; no configured camera
 * profile is substituted when a measurement cannot be obtained.
 */

import { createHash } from "node:crypto";
import { measureCameraPacketLoss } from "./camera-packet-loss.js";
import { captureRtspLumaFrame, measureRtspStream } from "../streaming/rtsp-probe.js";
import { logger } from "../utils/logger.js";

export interface CameraHeartbeatData {
  cameraId: string;
  status: "online" | "offline" | "degraded" | "unknown";
  responseTimeMs: number;
  currentFps?: number;
  currentBitrate?: number;
  currentResolution?: { width: number; height: number };
  packetLoss?: number;
  latencyMs?: number;
  streamActive: boolean;
  videoLoss: boolean;
  imageFrozen?: boolean;
  blackScreen?: boolean;
  codec?: string;
  errorMessage?: string;
  reasonCodes: string[];
  quality: "verified" | "unavailable";
  metadata?: Record<string, unknown>;
}

export interface CameraConfig {
  id: string;
  name: string;
  /** Undefined when this appliance does not have the matching local secret. */
  rtspUrl?: string;
  expectedFps?: number;
  expectedBitrate?: number;
  enabled: boolean;
}

type FrameState = { hash: string; identicalSamples: number };

export function assessLumaFrame(previous: FrameState | undefined, frame: Buffer): {
  state: FrameState;
  imageFrozen: boolean;
  blackScreen: boolean;
  brightness: number;
} {
  const brightness = frame.reduce((sum, value) => sum + value, 0) / frame.length;
  const hash = createHash("sha256").update(frame).digest("hex");
  const identicalSamples = previous?.hash === hash ? previous.identicalSamples + 1 : 1;
  return {
    state: { hash, identicalSamples },
    // Three successive identical 64x36 luminance samples avoids flagging a
    // single still image as a frozen stream.
    imageFrozen: identicalSamples >= 3,
    blackScreen: brightness <= 10,
    brightness: Math.round(brightness * 10) / 10,
  };
}

export class CameraHeartbeatService {
  private readonly cameras = new Map<string, CameraConfig>();
  private readonly frameStates = new Map<string, FrameState>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly apiEndpoint: string,
    private readonly branchId: string,
    private readonly edgeAgentId: string,
    private readonly developmentUserId: string,
    private readonly ffprobePath = "ffprobe",
    private readonly ffmpegPath = "ffmpeg",
    private readonly edgeBridgeSharedKey?: string,
  ) {}

  replaceCameras(cameras: CameraConfig[]): void {
    const retainedIds = new Set(cameras.map((camera) => camera.id));
    this.cameras.clear();
    for (const camera of cameras) this.cameras.set(camera.id, camera);
    for (const cameraId of this.frameStates.keys()) {
      if (!retainedIds.has(cameraId)) this.frameStates.delete(cameraId);
    }
    logger.info(`Synchronized ${cameras.length} camera(s) for heartbeat monitoring`);
  }

  start(intervalMs = 30_000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.sendAllHeartbeats().catch((error: unknown) => logger.error("Failed to send initial camera heartbeats", { error }));
    this.heartbeatInterval = setInterval(() => {
      this.sendAllHeartbeats().catch((error: unknown) => logger.error("Failed to send camera heartbeats", { error }));
    }, intervalMs);
  }

  stop(): void {
    this.isRunning = false;
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
  }

  private async sendAllHeartbeats(): Promise<void> {
    const cameras = [...this.cameras.values()].filter((camera) => camera.enabled);
    const batchSize = 5;
    for (let index = 0; index < cameras.length; index += batchSize) {
      await Promise.allSettled(cameras.slice(index, index + batchSize).map((camera) => this.sendHeartbeat(camera)));
    }
  }

  private async sendHeartbeat(camera: CameraConfig): Promise<void> {
    const startedAt = Date.now();
    try {
      const data = camera.rtspUrl
        ? await this.measureCamera(camera, startedAt)
        : {
            cameraId: camera.id, status: "unknown" as const, responseTimeMs: Date.now() - startedAt,
            streamActive: false, videoLoss: false, reasonCodes: ["stream_secret_unavailable"],
            quality: "unavailable" as const, errorMessage: "Local RTSP secret is unavailable",
          };
      await this.sendToPlatform(camera.id, data);
      logger.debug(`Heartbeat sent for camera ${camera.name}: ${data.status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Failed to send heartbeat for camera ${camera.name}`, { error });
      await this.sendToPlatform(camera.id, {
        cameraId: camera.id, status: "offline", responseTimeMs: Date.now() - startedAt,
        streamActive: false, videoLoss: true, quality: "verified",
        errorMessage: message, reasonCodes: ["camera_probe_failed"],
      }).catch(() => undefined);
    }
  }

  private async measureCamera(camera: CameraConfig, startedAt: number): Promise<CameraHeartbeatData> {
    const rtspUrl = camera.rtspUrl!;
    const stream = await measureRtspStream(rtspUrl, { ffprobePath: this.ffprobePath });
    const responseTimeMs = Date.now() - startedAt;
    if (!stream.reachable) {
      return {
        cameraId: camera.id, status: "offline", responseTimeMs,
        streamActive: false, videoLoss: true, quality: "verified",
        errorMessage: stream.error ?? "Camera RTSP stream is unreachable",
        reasonCodes: ["rtsp_unreachable"],
      };
    }

    const [packetLoss, frame] = await Promise.all([
      measureCameraPacketLoss(rtspUrl),
      captureRtspLumaFrame(rtspUrl, this.ffmpegPath),
    ]);
    const frameHealth = frame ? assessLumaFrame(this.frameStates.get(camera.id), frame) : null;
    if (frameHealth) this.frameStates.set(camera.id, frameHealth.state);

    const reasonCodes: string[] = [];
    if (stream.fps === null) reasonCodes.push("fps_unavailable");
    if (stream.bitrateKbps === null) reasonCodes.push("bitrate_unavailable");
    if (packetLoss === null) reasonCodes.push("packet_loss_unavailable");
    if (!frameHealth) {
      reasonCodes.push("freeze_detection_unavailable", "black_screen_detection_unavailable");
    } else {
      if (frameHealth.imageFrozen) reasonCodes.push("frozen_frame_detected");
      if (frameHealth.blackScreen) reasonCodes.push("black_screen_detected");
    }
    const degraded = Boolean(
      (camera.expectedFps && stream.fps !== null && stream.fps < camera.expectedFps * 0.8) ||
      (camera.expectedBitrate && stream.bitrateKbps !== null && stream.bitrateKbps < camera.expectedBitrate * 0.7) ||
      (packetLoss !== null && packetLoss > 5) ||
      frameHealth?.imageFrozen || frameHealth?.blackScreen,
    );

    return {
      cameraId: camera.id,
      status: degraded ? "degraded" : "online",
      responseTimeMs,
      streamActive: true,
      videoLoss: false,
      quality: "verified",
      ...(stream.fps === null ? {} : { currentFps: stream.fps }),
      ...(stream.bitrateKbps === null ? {} : { currentBitrate: stream.bitrateKbps }),
      ...(stream.width === null || stream.height === null ? {} : { currentResolution: { width: stream.width, height: stream.height } }),
      ...(packetLoss === null ? {} : { packetLoss }),
      ...(frameHealth ? { imageFrozen: frameHealth.imageFrozen, blackScreen: frameHealth.blackScreen } : {}),
      ...(stream.codec ? { codec: stream.codec } : {}),
      metadata: {
        sampleDurationSeconds: stream.sampleDurationSeconds,
        ...(frameHealth ? { frameBrightness: frameHealth.brightness, freezeSamples: frameHealth.state.identicalSamples } : {}),
        ...(packetLoss === null ? {} : { packetLossMethod: "icmp" }),
      },
      reasonCodes,
    };
  }

  private async sendToPlatform(cameraId: string, data: CameraHeartbeatData): Promise<void> {
    const observedAt = new Date().toISOString();
    const response = await fetch(`${this.apiEndpoint}/v1/edge-agents/${encodeURIComponent(this.edgeAgentId)}/telemetry`, {
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
        quality: data.quality,
        idempotencyKey: `${this.edgeAgentId}:camera:${cameraId}:${observedAt}`,
        metrics: {
          status: data.status,
          responseTimeMs: data.responseTimeMs,
          streamActive: data.streamActive,
          videoLoss: data.videoLoss,
          width: data.currentResolution?.width ?? null,
          height: data.currentResolution?.height ?? null,
          codec: data.codec ?? null,
          fps: data.currentFps ?? null,
          bitrateKbps: data.currentBitrate ?? null,
          packetLossPercent: data.packetLoss ?? null,
          imageFrozen: data.imageFrozen ?? null,
          blackScreen: data.blackScreen ?? null,
        },
        reasonCodes: data.reasonCodes,
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  getStats() {
    const cameras = [...this.cameras.values()];
    return { totalCameras: cameras.length, enabledCameras: cameras.filter((camera) => camera.enabled).length, isRunning: this.isRunning };
  }
}

let heartbeatService: CameraHeartbeatService | null = null;

export function initializeCameraHeartbeat(
  apiEndpoint: string,
  branchId: string,
  edgeAgentId: string,
  developmentUserId: string,
  ffprobePath = "ffprobe",
  ffmpegPath = "ffmpeg",
  edgeBridgeSharedKey?: string,
): CameraHeartbeatService {
  if (!heartbeatService) {
    heartbeatService = new CameraHeartbeatService(
      apiEndpoint, branchId, edgeAgentId, developmentUserId, ffprobePath, ffmpegPath, edgeBridgeSharedKey,
    );
  }
  return heartbeatService;
}
