/**
 * Edge-side camera telemetry. All reported quality values are measured from
 * the local RTSP stream or the local camera network path; no configured camera
 * profile is substituted when a measurement cannot be obtained.
 */

import { createHash } from "node:crypto";
import { measureCameraPacketLoss } from "./camera-packet-loss.js";
import { captureRtspRgbFrame, measureRtspStream } from "../streaming/rtsp-probe.js";
import { createRtspRgbStream, type RgbFrameStream } from "../streaming/rtsp-rgb-stream.js";
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
  branchId?: string;
  name: string;
  /** Undefined when this appliance does not have the matching local secret. */
  rtspUrl?: string;
  expectedFps?: number;
  expectedBitrate?: number;
  enabled: boolean;
  /** Enables frame delivery for live counting as well as configured AI rules. */
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
  private readonly analyticsDeliveryRetryAfter = new Map<string, number>();
  private readonly analyticsDeliveryInProgress = new Set<string>();
  private readonly analyticsStreams = new Map<string, { uri: string; stream: RgbFrameStream }>();
  private readonly analyticsProcessingInProgress = new Set<string>();
  private readonly analyticsLastCapturedAt = new Map<string, string>();
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
    private readonly onAnalyticsRgbFrame?: (frame: { cameraId: string; rgb: Buffer; width: number; height: number; capturedAt: string }) => Promise<void>,
  ) {}

  replaceCameras(cameras: CameraConfig[]): void {
    const retainedIds = new Set(cameras.map((camera) => camera.id));
    this.cameras.clear();
    for (const camera of cameras) this.cameras.set(camera.id, camera);
    for (const cameraId of this.frameStates.keys()) {
      if (!retainedIds.has(cameraId)) this.frameStates.delete(cameraId);
    }
    for (const cameraId of this.analyticsDeliveryRetryAfter.keys()) {
      if (!retainedIds.has(cameraId)) this.analyticsDeliveryRetryAfter.delete(cameraId);
    }
    if (this.isRunning) this.syncAnalyticsStreams();
    logger.info(`Synchronized ${cameras.length} camera(s) for heartbeat monitoring`);
  }

  updateCameraStream(cameraId: string, sourceUri: string): void {
    const camera = this.cameras.get(cameraId);
    if (!camera) return;
    camera.rtspUrl = sourceUri;
    this.cameraSourceVersions.set(cameraId, (this.cameraSourceVersions.get(cameraId) ?? 0) + 1);
    this.frameStates.delete(cameraId);
    this.analyticsStreams.get(cameraId)?.stream.stop();
    this.analyticsStreams.delete(cameraId);
    this.analyticsLastCapturedAt.delete(cameraId);
    this.analyticsDeliveryRetryAfter.delete(cameraId);
    this.consecutiveFailures.delete(cameraId);
    if (this.isRunning) this.syncAnalyticsStreams();
  }

  private readonly cameraSourceVersions = new Map<string, number>();

  start(intervalMs = 30_000, analyticsIntervalMs = 2_000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.syncAnalyticsStreams();
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
    for (const { stream } of this.analyticsStreams.values()) stream.stop();
    this.analyticsStreams.clear();
    this.analyticsLastCapturedAt.clear();
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
    this.syncAnalyticsStreams();
    const cameras = [...this.cameras.values()].filter((camera) => this.analyticsStreams.has(camera.id));
    // Each camera has its own backpressure. An outstanding upload never
    // prevents the next tick from delivering a fresh frame for another camera.
    await Promise.allSettled(cameras.map((camera) => this.captureAnalyticsFrame(camera)));
  }

  private syncAnalyticsStreams(): void {
    const eligible = new Map([...this.cameras.values()].filter(camera =>
      this.analyticsFrameSender && camera.enabled && camera.analyticsEnabled === true && camera.rtspUrl,
    ).map(camera => [camera.id, camera]));
    for (const [id, current] of this.analyticsStreams) {
      if (eligible.get(id)?.rtspUrl === current.uri) continue;
      current.stream.stop();
      this.analyticsStreams.delete(id);
      this.analyticsLastCapturedAt.delete(id);
      this.analyticsDeliveryRetryAfter.delete(id);
      this.frameStates.delete(id);
      this.cameraSourceVersions.set(id, (this.cameraSourceVersions.get(id) ?? 0) + 1);
    }
    for (const [id, camera] of eligible) {
      if (this.analyticsStreams.has(id)) continue;
      const stream = createRtspRgbStream(camera.rtspUrl!, this.ffmpegPath, 640, 360, reason => {
        logger.warn("Analytics capture reconnecting", { cameraId: id, reason });
      });
      this.analyticsStreams.set(id, { uri: camera.rtspUrl!, stream });
      stream.start();
    }
  }

  private async captureAnalyticsFrame(camera: CameraConfig): Promise<void> {
    if (Date.now() < (this.analyticsDeliveryRetryAfter.get(camera.id) ?? 0) ||
        this.analyticsDeliveryInProgress.has(camera.id) || this.analyticsProcessingInProgress.has(camera.id)) return;
    const width = 640;
    const height = 360;
    const frame = this.analyticsStreams.get(camera.id)?.stream.latestFrame();
    if (!frame || this.analyticsLastCapturedAt.get(camera.id) === frame.capturedAt) return;
    this.analyticsLastCapturedAt.set(camera.id, frame.capturedAt);
    this.analyticsProcessingInProgress.add(camera.id);
    try {
      await Promise.all([
        this.deliverAnalyticsFrame(camera.id, frame.rgb, width, height, "edge-rtsp-scheduled", frame.capturedAt),
        this.onAnalyticsRgbFrame?.({ cameraId: camera.id, rgb: frame.rgb, width, height, capturedAt: frame.capturedAt }),
      ]);
    } finally {
      this.analyticsProcessingInProgress.delete(camera.id);
    }
  }

  private async sendHeartbeat(camera: CameraConfig): Promise<void> {
    const startedAt = Date.now();
    const sourceAtStart = camera.rtspUrl;
    const sourceVersion = this.cameraSourceVersions.get(camera.id) ?? 0;
    const sourceChanged = () => {
      const current = this.cameras.get(camera.id);
      return sourceVersion !== (this.cameraSourceVersions.get(camera.id) ?? 0) ||
        camera.rtspUrl !== sourceAtStart || (current !== undefined && current.rtspUrl !== sourceAtStart);
    };
    try {
      const data = camera.rtspUrl
        ? await this.measureCamera(camera, startedAt)
        : {
            cameraId: camera.id, status: "unknown" as const, responseTimeMs: Date.now() - startedAt,
            streamActive: false, videoLoss: false, reasonCodes: ["stream_secret_unavailable"],
            quality: "unavailable" as const, errorMessage: "Local RTSP secret is unavailable",
          };
      if (sourceChanged()) return;
      await this.sendToPlatform(camera.id, data);
      this.considerAutomaticRecovery(camera, data);
      logger.debug(`Heartbeat sent for camera ${camera.name}: ${data.status}`);
    } catch (error) {
      if (sourceChanged()) return;
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
      const failures = (this.consecutiveFailures.get(camera.id) ?? 0) + 1;
      this.consecutiveFailures.set(camera.id, failures);
      const isActuallyOffline = failures >= 3;
      return {
        cameraId: camera.id,
        status: isActuallyOffline ? "offline" : "degraded",
        responseTimeMs,
        streamActive: false,
        videoLoss: isActuallyOffline,
        quality: "verified",
        errorMessage: stream.error ?? "Camera RTSP stream is unreachable",
        reasonCodes: isActuallyOffline ? ["rtsp_unreachable"] : ["rtsp_probe_timeout"],
      };
    }
    this.consecutiveFailures.delete(camera.id);

    // Health samples also feed helmet inference. Preserve the same head detail
    // as scheduled analytics captures instead of mixing in 320x180 frames.
    const analyticsWidth = 640;
    const analyticsHeight = 360;
    const [packetLoss, frame] = await Promise.all([
      measureCameraPacketLoss(rtspUrl),
      this.analyticsStreams.has(camera.id)
        ? Promise.resolve(this.analyticsStreams.get(camera.id)?.stream.latestFrame()?.rgb ?? null)
        : captureRtspRgbFrame(rtspUrl, this.ffmpegPath, 10_000, analyticsWidth, analyticsHeight),
    ]);
    const frameHealth = frame
      ? assessAnalogRgbFrame(this.frameStates.get(camera.id), frame, analyticsWidth, analyticsHeight)
      : null;
    if (frameHealth) this.frameStates.set(camera.id, frameHealth.state);
    if (frame && this.analyticsFrameSender && camera.analyticsEnabled !== false && !this.analyticsStreams.has(camera.id)) {
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
      branchId: this.cameras.get(cameraId)?.branchId ?? this.branchId,
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
    capturedAt = new Date().toISOString(),
  ): Promise<void> {
    if (!this.analyticsFrameSender) return;
    if (Date.now() < (this.analyticsDeliveryRetryAfter.get(cameraId) ?? 0) ||
        this.analyticsDeliveryInProgress.has(cameraId)) return;
    this.analyticsDeliveryInProgress.add(cameraId);
    const sourceVersion = this.cameraSourceVersions.get(cameraId) ?? 0;
    try {
      await this.analyticsFrameSender({
        cameraId,
        capturedAt,
        width,
        height,
        imageBase64: frame.toString("base64"),
        metadata: { source, edgeAgentId: this.edgeAgentId },
      });
      this.analyticsDeliveryRetryAfter.delete(cameraId);
    } catch (error: unknown) {
      // A failure from the old source must not delay its replacement stream.
      if (sourceVersion === (this.cameraSourceVersions.get(cameraId) ?? 0)) {
        this.analyticsDeliveryRetryAfter.set(cameraId, Date.now() + 60_000);
      }
      logger.warn("Analytics frame delivery failed; retrying this camera in 60s", {
        cameraId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.analyticsDeliveryInProgress.delete(cameraId);
    }
  }

  getStats() {
    const cameras = [...this.cameras.values()];
    return {
      totalCameras: cameras.length,
      enabledCameras: cameras.filter((camera) => camera.enabled).length,
      analyticsCameras: cameras.filter((camera) => camera.enabled && camera.analyticsEnabled !== false).length,
      heartbeatCycleRunning: this.heartbeatCycleRunning,
      analyticsCycleRunning: this.analyticsProcessingInProgress.size > 0,
      analyticsCaptureStreams: this.analyticsStreams.size,
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
  onAnalyticsRgbFrame?: (frame: { cameraId: string; rgb: Buffer; width: number; height: number; capturedAt: string }) => Promise<void>,
): CameraHeartbeatService {
  if (!heartbeatService) {
    heartbeatService = new CameraHeartbeatService(
      apiEndpoint, branchId, edgeAgentId, developmentUserId, ffprobePath, ffmpegPath,
      edgeAuthCredential, telemetrySender, onAutomaticRecovery, analyticsFrameSender, onAnalyticsRgbFrame,
    );
  }
  return heartbeatService;
}
