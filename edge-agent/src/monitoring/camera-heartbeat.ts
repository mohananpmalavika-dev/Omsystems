/**
 * Edge-side camera telemetry. All reported quality values are measured from
 * the local RTSP stream or the local camera network path; no configured camera
 * profile is substituted when a measurement cannot be obtained.
 */

import { createHash } from "node:crypto";
import { measureCameraPacketLoss } from "./camera-packet-loss.js";
import { captureRtspRgbFrame, measureRtspStream } from "../streaming/rtsp-probe.js";
import { assessAnalogRgbFrame, type AnalogSignalState } from "./analog-signal-quality.js";
import { logger } from "../utils/logger.js";
import type { AnalyticsFramePayload, TelemetryPayload } from "../registration/gateway-client.js";

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
  blueScreen?: boolean;
  severeBlur?: boolean;
  excessiveNoise?: boolean;
  rollingInterference?: boolean;
  colourLoss?: boolean;
  brightnessFailure?: boolean;
  obstructionSuspected?: boolean;
  cameraMovementSuspected?: boolean;
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
  /** High-frequency frame delivery is enabled only when the camera has an active AI rule. */
  analyticsEnabled?: boolean;
}

/**
 * Signals that indicate a usable stream has a delivery or image-quality
 * failure.  Monochrome night-mode video and normal scene changes are kept as
 * evidence, but are not failures: IR cameras commonly lose colour at night
 * and a busy scene is not camera movement. ICMP loss is also evidence only:
 * many DVRs intentionally do not answer ping while their RTSP streams remain
 * healthy.
 */
export function shouldMarkCameraDegraded(input: {
  expectedFps?: number | undefined;
  expectedBitrate?: number | undefined;
  fps: number | null;
  bitrateKbps: number | null;
  packetLoss: number | null;
  imageFrozen?: boolean | undefined;
  blackScreen?: boolean | undefined;
  blueScreen?: boolean | undefined;
  severeBlur?: boolean | undefined;
  excessiveNoise?: boolean | undefined;
  rollingInterference?: boolean | undefined;
  brightnessFailure?: boolean | undefined;
  obstructionSuspected?: boolean | undefined;
}): boolean {
  return Boolean(
    (input.expectedFps && input.fps !== null && input.fps < input.expectedFps * 0.8) ||
    (input.expectedBitrate && input.bitrateKbps !== null && input.bitrateKbps < input.expectedBitrate * 0.7) ||
    input.imageFrozen || input.blackScreen || input.blueScreen || input.severeBlur ||
    input.excessiveNoise || input.rollingInterference || input.brightnessFailure ||
    input.obstructionSuspected,
  );
}

export interface AutomaticCameraRecoveryRequest {
  cameraId: string;
  cameraName: string;
  rtspUrl: string;
  consecutiveFailures: number;
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
  private readonly frameStates = new Map<string, AnalogSignalState>();
  private readonly consecutiveFailures = new Map<string, number>();
  private readonly recoveryInProgress = new Set<string>();
  private readonly recoveryCooldowns = new Map<string, number>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private analyticsInterval: NodeJS.Timeout | null = null;
  private heartbeatCycleRunning = false;
  private analyticsCycleRunning = false;
  private isRunning = false;

  constructor(
    private readonly apiEndpoint: string,
    private readonly branchId: string,
    private readonly edgeAgentId: string,
    private readonly developmentUserId: string | undefined,
    private readonly ffprobePath = "ffprobe",
    private readonly ffmpegPath = "ffmpeg",
    private readonly edgeAuthCredential?: string,
    private readonly telemetrySender?: (payload: TelemetryPayload) => Promise<unknown>,
    private readonly onAutomaticRecovery?: (request: AutomaticCameraRecoveryRequest) => Promise<void>,
    private readonly analyticsFrameSender?: (payload: AnalyticsFramePayload) => Promise<unknown>,
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

  start(intervalMs = 30_000, analyticsIntervalMs = 2_000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.sendAllHeartbeats().catch((error: unknown) => logger.error("Failed to send initial camera heartbeats", { error }));
    this.heartbeatInterval = setInterval(() => {
      this.sendAllHeartbeats().catch((error: unknown) => logger.error("Failed to send camera heartbeats", { error }));
    }, intervalMs);
    if (this.analyticsFrameSender) {
      this.analyticsInterval = setInterval(() => {
        this.sendAllAnalyticsFrames().catch((error: unknown) => logger.error("Failed to send analytics frames", { error }));
      }, analyticsIntervalMs);
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.analyticsInterval) clearInterval(this.analyticsInterval);
    this.heartbeatInterval = null;
    this.analyticsInterval = null;
  }

  private async sendAllHeartbeats(): Promise<void> {
    if (this.heartbeatCycleRunning) {
      logger.warn("Skipping overlapping camera heartbeat cycle");
      return;
    }
    this.heartbeatCycleRunning = true;
    try {
      const cameras = [...this.cameras.values()].filter((camera) => camera.enabled);
      const batchSize = 5;
      for (let index = 0; index < cameras.length; index += batchSize) {
        await Promise.allSettled(cameras.slice(index, index + batchSize).map((camera) => this.sendHeartbeat(camera)));
      }
    } finally {
      this.heartbeatCycleRunning = false;
    }
  }

  private async sendAllAnalyticsFrames(): Promise<void> {
    if (this.analyticsCycleRunning) {
      logger.warn("Skipping overlapping analytics frame cycle");
      return;
    }
    this.analyticsCycleRunning = true;
    try {
      const cameras = [...this.cameras.values()].filter((camera) =>
        camera.enabled && camera.analyticsEnabled !== false && Boolean(camera.rtspUrl),
      );
      // FFmpeg process startup is CPU intensive. Two concurrent captures keep
      // inference fresh without allowing a large branch to exhaust the host.
      const batchSize = 2;
      for (let index = 0; index < cameras.length; index += batchSize) {
        await Promise.allSettled(cameras.slice(index, index + batchSize).map((camera) => this.captureAnalyticsFrame(camera)));
      }
    } finally {
      this.analyticsCycleRunning = false;
    }
  }

  private async captureAnalyticsFrame(camera: CameraConfig): Promise<void> {
    const width = 320;
    const height = 180;
    const frame = await captureRtspRgbFrame(camera.rtspUrl!, this.ffmpegPath, 10_000, width, height);
    if (!frame) {
      logger.warn("Analytics frame capture unavailable", { cameraId: camera.id });
      return;
    }
    await this.deliverAnalyticsFrame(camera.id, frame, width, height, "edge-rtsp-scheduled");
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
      this.considerAutomaticRecovery(camera, data);
      logger.debug(`Heartbeat sent for camera ${camera.name}: ${data.status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Failed to send heartbeat for camera ${camera.name}`, { error });
      await this.sendToPlatform(camera.id, {
        cameraId: camera.id, status: "offline", responseTimeMs: Date.now() - startedAt,
        streamActive: false, videoLoss: true, quality: "verified",
        errorMessage: message, reasonCodes: ["camera_probe_failed"],
      }).catch(() => undefined);
      this.considerAutomaticRecovery(camera, {
        cameraId: camera.id,
        status: "offline",
        responseTimeMs: Date.now() - startedAt,
        streamActive: false,
        videoLoss: true,
        quality: "verified",
        errorMessage: message,
        reasonCodes: ["camera_probe_failed"],
      });
    }
  }

  private considerAutomaticRecovery(camera: CameraConfig, data: CameraHeartbeatData) {
    if (data.status !== "offline") {
      this.consecutiveFailures.delete(camera.id);
      return;
    }
    if (!camera.rtspUrl || !this.onAutomaticRecovery) return;

    const failures = (this.consecutiveFailures.get(camera.id) ?? 0) + 1;
    this.consecutiveFailures.set(camera.id, failures);
    const now = Date.now();
    const cooldownUntil = this.recoveryCooldowns.get(camera.id) ?? 0;
    if (failures < 3 || this.recoveryInProgress.has(camera.id) || cooldownUntil > now) return;

    this.recoveryInProgress.add(camera.id);
    this.recoveryCooldowns.set(camera.id, now + 15 * 60_000);
    void this.onAutomaticRecovery({
      cameraId: camera.id,
      cameraName: camera.name,
      rtspUrl: camera.rtspUrl,
      consecutiveFailures: failures,
    }).catch((error) => {
      logger.error("Automatic camera recovery failed", {
        cameraId: camera.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }).finally(() => this.recoveryInProgress.delete(camera.id));
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

    const analyticsWidth = 320;
    const analyticsHeight = 180;
    const [packetLoss, frame] = await Promise.all([
      measureCameraPacketLoss(rtspUrl),
      captureRtspRgbFrame(rtspUrl, this.ffmpegPath, 10_000, analyticsWidth, analyticsHeight),
    ]);
    const frameHealth = frame
      ? assessAnalogRgbFrame(this.frameStates.get(camera.id), frame, analyticsWidth, analyticsHeight)
      : null;
    if (frameHealth) this.frameStates.set(camera.id, frameHealth.state);
    if (frame && this.analyticsFrameSender && camera.analyticsEnabled !== false) {
      // Camera health must not wait behind cloud inference. The scheduled
      // analytics loop provides backpressure and this sample is best effort.
      void this.deliverAnalyticsFrame(camera.id, frame, analyticsWidth, analyticsHeight, "edge-rtsp-health");
    }

    const reasonCodes: string[] = [];
    if (stream.fps === null) reasonCodes.push("fps_unavailable");
    if (stream.bitrateKbps === null) reasonCodes.push("bitrate_unavailable");
    if (packetLoss === null) reasonCodes.push("packet_loss_unavailable");
    else if (packetLoss > 5) reasonCodes.push("icmp_packet_loss_reported");
    if (!frameHealth) {
      reasonCodes.push("analog_signal_analysis_unavailable");
    } else {
      if (frameHealth.imageFrozen) reasonCodes.push("frozen_frame_detected");
      if (frameHealth.blackScreen) reasonCodes.push("black_screen_detected");
      if (frameHealth.blueScreen) reasonCodes.push("blue_screen_detected");
      if (frameHealth.severeBlur) reasonCodes.push("severe_blur_detected");
      if (frameHealth.excessiveNoise) reasonCodes.push("excessive_analog_noise_detected");
      if (frameHealth.rollingInterference) reasonCodes.push("rolling_interference_detected");
      if (frameHealth.colourLoss) reasonCodes.push("colour_loss_detected");
      if (frameHealth.brightnessFailure) reasonCodes.push("brightness_failure_detected");
      if (frameHealth.obstructionSuspected) reasonCodes.push("camera_obstruction_suspected");
      if (frameHealth.cameraMovementSuspected) reasonCodes.push("camera_movement_suspected");
    }
    const degraded = shouldMarkCameraDegraded({
      expectedFps: camera.expectedFps,
      expectedBitrate: camera.expectedBitrate,
      fps: stream.fps,
      bitrateKbps: stream.bitrateKbps,
      packetLoss,
      imageFrozen: frameHealth?.imageFrozen,
      blackScreen: frameHealth?.blackScreen,
      blueScreen: frameHealth?.blueScreen,
      severeBlur: frameHealth?.severeBlur,
      excessiveNoise: frameHealth?.excessiveNoise,
      rollingInterference: frameHealth?.rollingInterference,
      brightnessFailure: frameHealth?.brightnessFailure,
      obstructionSuspected: frameHealth?.obstructionSuspected,
    });

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
      ...(frameHealth ? {
        imageFrozen: frameHealth.imageFrozen,
        blackScreen: frameHealth.blackScreen,
        blueScreen: frameHealth.blueScreen,
        severeBlur: frameHealth.severeBlur,
        excessiveNoise: frameHealth.excessiveNoise,
        rollingInterference: frameHealth.rollingInterference,
        colourLoss: frameHealth.colourLoss,
        brightnessFailure: frameHealth.brightnessFailure,
        obstructionSuspected: frameHealth.obstructionSuspected,
        cameraMovementSuspected: frameHealth.cameraMovementSuspected,
      } : {}),
      ...(stream.codec ? { codec: stream.codec } : {}),
      metadata: {
        sampleDurationSeconds: stream.sampleDurationSeconds,
        ...(frameHealth ? {
          frameBrightness: frameHealth.brightness,
          frameContrast: frameHealth.contrast,
          frameEdgeScore: frameHealth.edgeScore,
          frameNoiseScore: frameHealth.noiseScore,
          rowInterferenceScore: frameHealth.rowInterferenceScore,
          frameColourScore: frameHealth.colourScore,
          sceneChangeScore: frameHealth.sceneChangeScore,
          freezeSamples: frameHealth.state.identicalSamples,
          timeOverlayVerification: "unavailable-without-ocr-clock-adapter",
        } : {}),
        ...(packetLoss === null ? {} : { packetLossMethod: "icmp" }),
      },
      reasonCodes,
    };
  }

  private async sendToPlatform(cameraId: string, data: CameraHeartbeatData): Promise<void> {
    const observedAt = new Date().toISOString();
    const payload: TelemetryPayload = {
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
        blueScreen: data.blueScreen ?? null,
        severeBlur: data.severeBlur ?? null,
        excessiveNoise: data.excessiveNoise ?? null,
        rollingInterference: data.rollingInterference ?? null,
        colourLoss: data.colourLoss ?? null,
        brightnessFailure: data.brightnessFailure ?? null,
        obstructionSuspected: data.obstructionSuspected ?? null,
        cameraMovementSuspected: data.cameraMovementSuspected ?? null,
      },
      reasonCodes: data.reasonCodes,
    };
    if (this.telemetrySender) {
      await this.telemetrySender(payload);
      return;
    }
    const response = await fetch(`${this.apiEndpoint}/v1/edge-agents/${encodeURIComponent(this.edgeAgentId)}/telemetry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.developmentUserId ? { "x-user-id": this.developmentUserId } : {}),
        ...(this.edgeAuthCredential?.startsWith("sggw_")
          ? { "x-edge-agent-token": this.edgeAuthCredential }
          : this.edgeAuthCredential ? { "x-edge-bridge-key": this.edgeAuthCredential } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  private async deliverAnalyticsFrame(
    cameraId: string,
    frame: Buffer,
    width: number,
    height: number,
    source: string,
  ): Promise<void> {
    if (!this.analyticsFrameSender) return;
    await this.analyticsFrameSender({
      cameraId,
      capturedAt: new Date().toISOString(),
      width,
      height,
      imageBase64: frame.toString("base64"),
      metadata: { source, edgeAgentId: this.edgeAgentId },
    }).catch((error: unknown) => logger.warn("Analytics frame delivery failed", {
      cameraId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  getStats() {
    const cameras = [...this.cameras.values()];
    return {
      totalCameras: cameras.length,
      enabledCameras: cameras.filter((camera) => camera.enabled).length,
      analyticsCameras: cameras.filter((camera) => camera.enabled && camera.analyticsEnabled !== false).length,
      heartbeatCycleRunning: this.heartbeatCycleRunning,
      analyticsCycleRunning: this.analyticsCycleRunning,
      isRunning: this.isRunning,
    };
  }
}

let heartbeatService: CameraHeartbeatService | null = null;

export function initializeCameraHeartbeat(
  apiEndpoint: string,
  branchId: string,
  edgeAgentId: string,
  developmentUserId: string | undefined,
  ffprobePath = "ffprobe",
  ffmpegPath = "ffmpeg",
  edgeAuthCredential?: string,
  telemetrySender?: (payload: TelemetryPayload) => Promise<unknown>,
  onAutomaticRecovery?: (request: AutomaticCameraRecoveryRequest) => Promise<void>,
  analyticsFrameSender?: (payload: AnalyticsFramePayload) => Promise<unknown>,
): CameraHeartbeatService {
  if (!heartbeatService) {
    heartbeatService = new CameraHeartbeatService(
      apiEndpoint, branchId, edgeAgentId, developmentUserId, ffprobePath, ffmpegPath,
      edgeAuthCredential, telemetrySender, onAutomaticRecovery, analyticsFrameSender,
    );
  }
  return heartbeatService;
}
