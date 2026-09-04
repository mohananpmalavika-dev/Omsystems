/**
 * Camera Health Detection (Tampering, Video Loss)
 * Monitors camera feed quality and detects issues
 */

import { BaseDetector, type DetectionFrame, type DetectionResult } from "./base-detector.js";

interface CameraState {
  lastFrameTimestamp: Date;
  recentBrightness: number[];
  recentFrames: number;
  tamperingDetectedAt?: Date;
  wasIlluminated?: boolean;
}

export class CameraHealthDetector extends BaseDetector {
  private cameraStates = new Map<string, CameraState>();
  private readonly VIDEO_LOSS_TIMEOUT_MS = 60000; // 60 seconds for health check
  private readonly BRIGHTNESS_HISTORY_SIZE = 30; // Last 30 frames

  constructor() {
    super("camera-health", "1.0.0");
  }

  async initialize(): Promise<void> {
    // No initialization needed
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    const results: DetectionResult[] = [];
    const now = frame.timestamp;

    // Get or create camera state
    let state = this.cameraStates.get(frame.cameraId);
    if (!state) {
      state = {
        lastFrameTimestamp: now,
        recentBrightness: [],
        recentFrames: 0,
        wasIlluminated: false,
      };
      this.cameraStates.set(frame.cameraId, state);
    }

    // Explicit video loss signaled by edge/protocol, or empty payload
    const isExplicitVideoLoss =
      frame.metadata?.videoLoss === true ||
      frame.metadata?.streamStatus === "lost" ||
      frame.imageData.length === 0;

    if (isExplicitVideoLoss) {
      results.push({
        detectionType: "video-loss",
        confidence: 0.99,
        objects: [],
        metadata: {
          reason: frame.metadata?.videoLoss ? "edge_reported_video_loss" : "empty_frame_data",
        },
        requiresAlert: true,
      });
      state.lastFrameTimestamp = now;
      return results;
    }

    // Calculate frame brightness
    const brightness = this.calculateBrightness(frame.imageData);
    if (brightness >= 20) {
      state.wasIlluminated = true;
    }
    state.recentBrightness.push(brightness);
    if (state.recentBrightness.length > this.BRIGHTNESS_HISTORY_SIZE) {
      state.recentBrightness.shift();
    }

    // Detect camera tampering ONLY if camera was previously illuminated
    // (An unconnected/permanently black channel was never illuminated, so it is NOT tampering!)
    if (state.recentBrightness.length >= 10 && state.wasIlluminated) {
      const tamperingResult = this.detectTampering(state.recentBrightness);
      if (tamperingResult.isTampering) {
        if (!state.tamperingDetectedAt) {
          state.tamperingDetectedAt = now;
        }

        results.push({
          detectionType: "camera-tampering",
          confidence: tamperingResult.confidence,
          objects: [],
          metadata: {
            tamperingType: tamperingResult.type,
            brightness,
            avgBrightness: tamperingResult.avgBrightness,
          },
          requiresAlert: true,
        });
      } else {
        state.tamperingDetectedAt = undefined;
      }
    }

    state.lastFrameTimestamp = now;
    state.recentFrames++;

    return results;
  }

  /**
   * Calculate average brightness of frame
   */
  private calculateBrightness(imageData: Buffer): number {
    if (imageData.length === 0) return 0;
    let total = 0;
    const pixelCount = imageData.length / 3; // RGB

    for (let i = 0; i < imageData.length; i += 3) {
      const r = imageData[i] ?? 0;
      const g = imageData[i + 1] ?? 0;
      const b = imageData[i + 2] ?? 0;
      // Calculate perceived brightness
      total += 0.299 * r + 0.587 * g + 0.114 * b;
    }

    return total / pixelCount;
  }

  /**
   * Detect camera tampering based on brightness patterns
   */
  private detectTampering(brightnessHistory: number[]): {
    isTampering: boolean;
    confidence: number;
    type?: string;
    avgBrightness?: number;
  } {
    const avg =
      brightnessHistory.reduce((a, b) => a + b, 0) / brightnessHistory.length;

    // Completely black (covered lens) - only valid if older frames in history were illuminated (>= 20)
    const olderFrames = brightnessHistory.slice(0, -3);
    const wasRecentlyBright = olderFrames.some((b) => b >= 20);
    if (avg < 5 && wasRecentlyBright) {
      return {
        isTampering: true,
        confidence: 0.95,
        type: "covered_lens",
        avgBrightness: avg,
      };
    }

    // Completely white (lens blocked by bright spotlight or laser)
    if (avg > 250 && olderFrames.some((b) => b < 220)) {
      return {
        isTampering: true,
        confidence: 0.95,
        type: "blinded_lens",
        avgBrightness: avg,
      };
    }

    // Sudden dramatic change from illuminated scene
    if (brightnessHistory.length >= 20) {
      const recentAvg =
        brightnessHistory.slice(-10).reduce((a, b) => a + b, 0) / 10;
      const olderAvg =
        brightnessHistory.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
      const change = Math.abs(recentAvg - olderAvg);

      if (change > 100 && olderAvg >= 20) {
        return {
          isTampering: true,
          confidence: 0.80,
          type: "sudden_change",
          avgBrightness: avg,
        };
      }
    }

    return { isTampering: false, confidence: 0 };
  }

  /**
   * Get camera health status
   */
  getCameraHealth(cameraId: string): {
    isHealthy: boolean;
    lastFrameAgo?: number;
    recentFrames?: number;
    avgBrightness?: number;
    status?: string;
    streamStatus?: string;
    recording?: boolean;
    inferenceMode?: string;
    lastInferenceSource?: string;
    inferenceFps?: number;
    inferenceLatencyMs?: number;
    lastDetectionAt?: Date;
  } {
    const state = this.cameraStates.get(cameraId);
    if (!state) {
      return { isHealthy: false };
    }

    const now = new Date();
    const lastFrameAgo = now.getTime() - state.lastFrameTimestamp.getTime();
    const avgBrightness =
      state.recentBrightness.length > 0
        ? state.recentBrightness.reduce((a, b) => a + b, 0) /
          state.recentBrightness.length
        : undefined;

    return {
      isHealthy: lastFrameAgo < this.VIDEO_LOSS_TIMEOUT_MS,
      lastFrameAgo,
      recentFrames: state.recentFrames,
      avgBrightness,
    };
  }

  async cleanup(): Promise<void> {
    this.cameraStates.clear();
  }

  getHealth() {
    return {
      status: "healthy" as const,
      details: `Monitoring ${this.cameraStates.size} cameras`,
    };
  }
}
