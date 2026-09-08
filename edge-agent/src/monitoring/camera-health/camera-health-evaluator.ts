/** Evidence-based seven-layer camera health classification. */
import type {
  CameraConfiguration, CameraHealth, CameraOperationalState, CameraHealthReason,
  HealthObservation, NetworkProbeResult, StreamProbeResult, DecodeProbeResult,
  FreezeAnalysis, RecorderChannelStatus, RecordingProbeResult,
} from "./types.js";

export const HEALTH_STALE_AFTER_MS = 90_000;

export interface EvaluationInput {
  camera: CameraConfiguration;
  network?: NetworkProbeResult | undefined;
  stream?: StreamProbeResult | undefined;
  decode?: DecodeProbeResult | undefined;
  freeze?: FreezeAnalysis | undefined;
  recorderChannel?: RecorderChannelStatus | undefined;
  recording?: RecordingProbeResult | undefined;
  observedAt?: Date | undefined;
}

function observation(available: boolean, passed: boolean | undefined, observedAt: Date, source: HealthObservation<boolean>["source"], confidence: number, errorCode?: string, latencyMs?: number): HealthObservation<boolean> {
  return {
    state: !available || passed === undefined ? "UNKNOWN" : passed ? "PASS" : "FAIL",
    value: available ? passed : undefined,
    observedAt, source, confidence: available ? confidence : 0,
    errorCode: available && passed === false ? errorCode : undefined, latencyMs,
  };
}

export class CameraHealthEvaluator {
  evaluate(input: EvaluationInput): CameraHealth {
    const observedAt = input.observedAt ?? new Date();
    const observedAtMs = observedAt.getTime();
    const isStale = !Number.isFinite(observedAtMs) || Date.now() - observedAtMs > HEALTH_STALE_AFTER_MS;
    const reasonCodes: CameraHealthReason[] = [];

    const network = observation(Boolean(input.network), input.network?.reachable, observedAt, "TCP", 0.98, "NETWORK_UNREACHABLE", input.network?.latencyMs);
    if (network.state === "FAIL") reasonCodes.push("NETWORK_UNREACHABLE");
    const streamPassed = input.stream ? input.stream.reachable && input.stream.videoTrackPresent : undefined;
    const streamError = input.stream?.errorCode === "AUTH_FAILED" ? "STREAM_AUTH_FAILED" : input.stream?.errorCode === "NO_VIDEO_TRACK" ? "NO_VIDEO_TRACK" : "RTSP_UNREACHABLE";
    const stream = observation(Boolean(input.stream), streamPassed, observedAt, "RTSP", 0.95, streamError, input.stream?.latencyMs);
    if (stream.state === "FAIL") reasonCodes.push(streamError as CameraHealthReason);
    const decoding = observation(Boolean(input.decode), input.decode?.decodable, observedAt, "FFMPEG", 0.95,
      input.decode?.errorCode === "CORRUPT_STREAM" ? "CORRUPT_STREAM" : input.decode?.errorCode === "UNSUPPORTED_CODEC" ? "UNSUPPORTED_CODEC" : "DECODE_FAILED", input.decode?.latencyMs);
    if (decoding.state === "FAIL") reasonCodes.push((decoding.errorCode ?? "DECODE_FAILED") as CameraHealthReason);
    const freeze = observation(Boolean(input.freeze), input.freeze ? !input.freeze.frozen : undefined, observedAt, "FFMPEG", input.freeze?.confidence ?? 0.9, "VIDEO_FROZEN");
    if (freeze.state === "FAIL") reasonCodes.push("VIDEO_FROZEN");
    const signal = observation(input.recorderChannel?.signalPresent != null, input.recorderChannel?.signalPresent ?? undefined, observedAt, "DAHUA_CGI", 0.95, "SIGNAL_LOST");
    if (signal.state === "FAIL") reasonCodes.push("SIGNAL_LOST");
    const recorderConnection = observation(input.recorderChannel?.connected != null, input.recorderChannel?.connected ?? undefined, observedAt, "DAHUA_CGI", 0.95, "RECORDER_CHANNEL_DISCONNECTED");
    if (recorderConnection.state === "FAIL") reasonCodes.push("RECORDER_CHANNEL_DISCONNECTED");
    const recordingPassed = input.recording ? input.recording.activelyWriting && input.recording.archiveContinuityOk : undefined;
    const recording = observation(Boolean(input.recording), recordingPassed, observedAt, "RECORDER_ARCHIVE", 0.95, "RECORDING_STOPPED");
    if (recording.state === "FAIL") reasonCodes.push("RECORDING_STOPPED");
    if (isStale) reasonCodes.push("STALE_OBSERVATION");

    const layers = [network, stream, decoding, freeze, signal, recorderConnection, recording];
    const criticalLayers = [network, stream, decoding, freeze, signal];
    let state: CameraOperationalState = "HEALTHY";
    if (isStale) state = "UNKNOWN";
    else if (criticalLayers.some((layer) => layer.state === "FAIL")) state = "CRITICAL";
    else if ([recording, recorderConnection].some((layer) => layer.state === "FAIL")) state = "DEGRADED";
    else if (layers.some((layer) => layer.state === "UNKNOWN")) state = "UNKNOWN";

    return {
      cameraId: input.camera.id, branchId: input.camera.branchId, cameraName: input.camera.name, channelNumber: input.camera.channelNumber,
      network, stream, decoding, freeze, signal, recorderConnection, recording,
      networkReachable: network.state === "PASS", streamReachable: stream.state === "PASS", framesDecodable: decoding.state === "PASS",
      videoFrozen: freeze.state === "FAIL", signalLost: signal.state === "FAIL", recorderConnected: recorderConnection.state === "PASS", recordingActive: recording.state === "PASS",
      streamLatencyMs: stream.latencyMs, fps: input.stream?.fps ?? input.decode?.fpsObserved, bitrateKbps: input.stream?.bitrateKbps,
      resolution: input.stream?.width && input.stream?.height ? `${input.stream.width}x${input.stream.height}` : undefined,
      codec: input.stream?.codec, lastFrameAt: input.decode?.lastFrameAt, lastRecordingAt: input.recording?.lastRecordedAt,
      observedAt, state, reasonCodes: [...new Set(reasonCodes)],
    };
  }
}

export const cameraHealthEvaluator = new CameraHealthEvaluator();
