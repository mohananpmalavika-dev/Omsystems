import type {
  Evidence,
  HealthState,
} from "../../recorder-drivers/domain/recorder-driver.types.js";

export interface CameraVerificationInput {
  cameraId: string;
  branchId: string;
  channelConnected?: boolean;
  signalLoss?: boolean;
  rtspReachable?: boolean;
  rtspLatencyMs?: number;
  decodable?: boolean;
  videoCodec?: string;
  fps?: number;
  width?: number;
  height?: number;
  frozenFrameDetected?: boolean;
  blackFrameDetected?: boolean;
  recordingNow?: boolean;
  lastRecordedAt?: string;
}

export interface CameraHealthObservation {
  cameraId: string;
  branchId: string;
  overallState: HealthState | "DEGRADED";
  summary: string;

  recorderChannel: Evidence<{
    connected: boolean;
    signalLoss: boolean;
  }>;

  streamReachability: Evidence<{
    rtspHandshake: boolean;
    latencyMs?: number;
  }>;

  decode: Evidence<{
    videoCodec?: string;
    fps?: number;
    width?: number;
    height?: number;
    decodable: boolean;
  }>;

  visualContinuity: Evidence<{
    frozen: boolean;
    blackFrame: boolean;
    obstruction?: boolean;
  }>;

  recording: Evidence<{
    recordingNow: boolean;
    lastRecordedAt?: string;
  }>;

  observedAt: string;
  expiresAt: string;
}

export class CameraVerificationService {
  evaluateCameraHealth(input: CameraVerificationInput, now: Date = new Date()): CameraHealthObservation {
    const expiresAt = new Date(now.getTime() + 120 * 1000).toISOString();
    const observedAtStr = now.toISOString();

    const channelConnected = input.channelConnected ?? true;
    const signalLoss = input.signalLoss ?? false;
    const rtspReachable = input.rtspReachable ?? true;
    const decodable = input.decodable ?? true;
    const frozen = input.frozenFrameDetected ?? false;
    const blackFrame = input.blackFrameDetected ?? false;
    const recordingNow = input.recordingNow ?? true;

    // 1. Channel Evidence
    const channelState: HealthState = channelConnected && !signalLoss ? "HEALTHY" : "UNHEALTHY";
    const recorderChannel: Evidence<{ connected: boolean; signalLoss: boolean }> = {
      state: channelState,
      value: { connected: channelConnected, signalLoss },
      source: "CP_PLUS_API",
      observedAt: observedAtStr,
      expiresAt,
      confidence: 1.0,
      reason: signalLoss ? "Recorder reports video signal loss on channel" : undefined,
    };

    // 2. Stream Reachability Evidence
    const streamState: HealthState = rtspReachable ? "HEALTHY" : "UNHEALTHY";
    const streamReachability: Evidence<{ rtspHandshake: boolean; latencyMs?: number }> = {
      state: streamState,
      value: { rtspHandshake: rtspReachable, latencyMs: input.rtspLatencyMs ?? 22 },
      source: "RTSP",
      observedAt: observedAtStr,
      expiresAt,
      confidence: 1.0,
      reason: !rtspReachable ? "RTSP stream handshake failed or timed out" : undefined,
    };

    // 3. Decode Evidence
    const decodeState: HealthState = decodable ? "HEALTHY" : "UNHEALTHY";
    const decode: Evidence<{
      videoCodec?: string;
      fps?: number;
      width?: number;
      height?: number;
      decodable: boolean;
    }> = {
      state: decodeState,
      value: {
        videoCodec: input.videoCodec ?? "H264",
        fps: input.fps ?? 25,
        width: input.width ?? 1920,
        height: input.height ?? 1080,
        decodable,
      },
      source: "EDGE_AGENT",
      observedAt: observedAtStr,
      expiresAt,
      confidence: 1.0,
      reason: !decodable ? "Video stream packets present but frames could not be decoded" : undefined,
    };

    // 4. Visual Continuity Evidence (Frozen / Black Frame)
    const visualHealthy = !frozen && !blackFrame;
    const visualState: HealthState = visualHealthy ? "HEALTHY" : "UNHEALTHY";
    const visualContinuity: Evidence<{ frozen: boolean; blackFrame: boolean; obstruction?: boolean }> = {
      state: visualState,
      value: { frozen, blackFrame, obstruction: false },
      source: "EDGE_AGENT",
      observedAt: observedAtStr,
      expiresAt,
      confidence: 0.95,
      reason: frozen
        ? "Frozen video detected (zero perceptual frame delta over 15s)"
        : blackFrame
          ? "Black/dark frame video loss detected"
          : undefined,
    };

    // 5. Recording Evidence
    const recState: HealthState = recordingNow ? "HEALTHY" : "UNHEALTHY";
    const recording: Evidence<{ recordingNow: boolean; lastRecordedAt?: string }> = {
      state: recState,
      value: { recordingNow, lastRecordedAt: input.lastRecordedAt ?? observedAtStr },
      source: "CP_PLUS_API",
      observedAt: observedAtStr,
      expiresAt,
      confidence: 1.0,
      reason: !recordingNow ? "Channel is not actively recording to storage" : undefined,
    };

    // Overall State Derivation
    let overallState: HealthState | "DEGRADED" = "HEALTHY";
    let summary = "Camera stream, decode, visual continuity, and recording are fully healthy";

    if (!channelConnected || signalLoss || !rtspReachable || !decodable || frozen || blackFrame) {
      overallState = "UNHEALTHY";
      summary = frozen
        ? "Camera stream is frozen"
        : blackFrame
          ? "Camera reports black frame / video loss"
          : signalLoss
            ? "Camera signal lost at recorder"
            : !rtspReachable
              ? "Camera RTSP stream is unreachable"
              : "Camera video stream cannot be decoded";
    } else if (!recordingNow) {
      overallState = "DEGRADED";
      summary = "Live video stream is active but recording is stopped or unavailable";
    }

    return {
      cameraId: input.cameraId,
      branchId: input.branchId,
      overallState,
      summary,
      recorderChannel,
      streamReachability,
      decode,
      visualContinuity,
      recording,
      observedAt: observedAtStr,
      expiresAt,
    };
  }
}

export const cameraVerificationService = new CameraVerificationService();
