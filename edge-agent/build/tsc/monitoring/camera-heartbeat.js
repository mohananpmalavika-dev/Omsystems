/**
 * Edge-side camera telemetry. All reported quality values are measured from
 * the local RTSP stream or the local camera network path; no configured camera
 * profile is substituted when a measurement cannot be obtained.
 */
import { createHash } from "node:crypto";
import { measureCameraPacketLoss } from "./camera-packet-loss.js";
import { captureRtspRgbFrame, measureRtspStream } from "../streaming/rtsp-probe.js";
import { assessAnalogRgbFrame } from "./analog-signal-quality.js";
import { logger } from "../utils/logger.js";
export function assessLumaFrame(previous, frame) {
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
    apiEndpoint;
    branchId;
    edgeAgentId;
    developmentUserId;
    ffprobePath;
    ffmpegPath;
    edgeAuthCredential;
    telemetrySender;
    cameras = new Map();
    frameStates = new Map();
    heartbeatInterval = null;
    isRunning = false;
    constructor(apiEndpoint, branchId, edgeAgentId, developmentUserId, ffprobePath = "ffprobe", ffmpegPath = "ffmpeg", edgeAuthCredential, telemetrySender) {
        this.apiEndpoint = apiEndpoint;
        this.branchId = branchId;
        this.edgeAgentId = edgeAgentId;
        this.developmentUserId = developmentUserId;
        this.ffprobePath = ffprobePath;
        this.ffmpegPath = ffmpegPath;
        this.edgeAuthCredential = edgeAuthCredential;
        this.telemetrySender = telemetrySender;
    }
    replaceCameras(cameras) {
        const retainedIds = new Set(cameras.map((camera) => camera.id));
        this.cameras.clear();
        for (const camera of cameras)
            this.cameras.set(camera.id, camera);
        for (const cameraId of this.frameStates.keys()) {
            if (!retainedIds.has(cameraId))
                this.frameStates.delete(cameraId);
        }
        logger.info(`Synchronized ${cameras.length} camera(s) for heartbeat monitoring`);
    }
    start(intervalMs = 30_000) {
        if (this.isRunning)
            return;
        this.isRunning = true;
        this.sendAllHeartbeats().catch((error) => logger.error("Failed to send initial camera heartbeats", { error }));
        this.heartbeatInterval = setInterval(() => {
            this.sendAllHeartbeats().catch((error) => logger.error("Failed to send camera heartbeats", { error }));
        }, intervalMs);
    }
    stop() {
        this.isRunning = false;
        if (this.heartbeatInterval)
            clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
    }
    async sendAllHeartbeats() {
        const cameras = [...this.cameras.values()].filter((camera) => camera.enabled);
        const batchSize = 5;
        for (let index = 0; index < cameras.length; index += batchSize) {
            await Promise.allSettled(cameras.slice(index, index + batchSize).map((camera) => this.sendHeartbeat(camera)));
        }
    }
    async sendHeartbeat(camera) {
        const startedAt = Date.now();
        try {
            const data = camera.rtspUrl
                ? await this.measureCamera(camera, startedAt)
                : {
                    cameraId: camera.id, status: "unknown", responseTimeMs: Date.now() - startedAt,
                    streamActive: false, videoLoss: false, reasonCodes: ["stream_secret_unavailable"],
                    quality: "unavailable", errorMessage: "Local RTSP secret is unavailable",
                };
            await this.sendToPlatform(camera.id, data);
            logger.debug(`Heartbeat sent for camera ${camera.name}: ${data.status}`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            logger.error(`Failed to send heartbeat for camera ${camera.name}`, { error });
            await this.sendToPlatform(camera.id, {
                cameraId: camera.id, status: "offline", responseTimeMs: Date.now() - startedAt,
                streamActive: false, videoLoss: true, quality: "verified",
                errorMessage: message, reasonCodes: ["camera_probe_failed"],
            }).catch(() => undefined);
        }
    }
    async measureCamera(camera, startedAt) {
        const rtspUrl = camera.rtspUrl;
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
            captureRtspRgbFrame(rtspUrl, this.ffmpegPath),
        ]);
        const frameHealth = frame ? assessAnalogRgbFrame(this.frameStates.get(camera.id), frame) : null;
        if (frameHealth)
            this.frameStates.set(camera.id, frameHealth.state);
        const reasonCodes = [];
        if (stream.fps === null)
            reasonCodes.push("fps_unavailable");
        if (stream.bitrateKbps === null)
            reasonCodes.push("bitrate_unavailable");
        if (packetLoss === null)
            reasonCodes.push("packet_loss_unavailable");
        if (!frameHealth) {
            reasonCodes.push("analog_signal_analysis_unavailable");
        }
        else {
            if (frameHealth.imageFrozen)
                reasonCodes.push("frozen_frame_detected");
            if (frameHealth.blackScreen)
                reasonCodes.push("black_screen_detected");
            if (frameHealth.blueScreen)
                reasonCodes.push("blue_screen_detected");
            if (frameHealth.severeBlur)
                reasonCodes.push("severe_blur_detected");
            if (frameHealth.excessiveNoise)
                reasonCodes.push("excessive_analog_noise_detected");
            if (frameHealth.rollingInterference)
                reasonCodes.push("rolling_interference_detected");
            if (frameHealth.colourLoss)
                reasonCodes.push("colour_loss_detected");
            if (frameHealth.brightnessFailure)
                reasonCodes.push("brightness_failure_detected");
            if (frameHealth.obstructionSuspected)
                reasonCodes.push("camera_obstruction_suspected");
            if (frameHealth.cameraMovementSuspected)
                reasonCodes.push("camera_movement_suspected");
        }
        const degraded = Boolean((camera.expectedFps && stream.fps !== null && stream.fps < camera.expectedFps * 0.8) ||
            (camera.expectedBitrate && stream.bitrateKbps !== null && stream.bitrateKbps < camera.expectedBitrate * 0.7) ||
            (packetLoss !== null && packetLoss > 5) ||
            frameHealth?.imageFrozen || frameHealth?.blackScreen || frameHealth?.blueScreen ||
            frameHealth?.severeBlur || frameHealth?.excessiveNoise || frameHealth?.rollingInterference ||
            frameHealth?.colourLoss || frameHealth?.brightnessFailure || frameHealth?.obstructionSuspected ||
            frameHealth?.cameraMovementSuspected);
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
    async sendToPlatform(cameraId, data) {
        const observedAt = new Date().toISOString();
        const payload = {
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
        if (!response.ok)
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    getStats() {
        const cameras = [...this.cameras.values()];
        return { totalCameras: cameras.length, enabledCameras: cameras.filter((camera) => camera.enabled).length, isRunning: this.isRunning };
    }
}
let heartbeatService = null;
export function initializeCameraHeartbeat(apiEndpoint, branchId, edgeAgentId, developmentUserId, ffprobePath = "ffprobe", ffmpegPath = "ffmpeg", edgeAuthCredential, telemetrySender) {
    if (!heartbeatService) {
        heartbeatService = new CameraHeartbeatService(apiEndpoint, branchId, edgeAgentId, developmentUserId, ffprobePath, ffmpegPath, edgeAuthCredential, telemetrySender);
    }
    return heartbeatService;
}
