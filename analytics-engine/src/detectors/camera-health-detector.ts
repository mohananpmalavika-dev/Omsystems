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
}

export class CameraHealthDetector extends BaseDetector {
  private cameraStates = new Map<string, CameraState>();
  private readonly VIDEO_LOSS_TIMEOUT_MS = 10000; // 10 seconds
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
      };
      this.cameraStates.set(frame.cameraId, state);
    }

    // Check for video loss
    const timeSinceLastFrame = now.getTime() - state.lastFrameTimestamp.getTime();
    if (timeSinceLastFrame > this.VIDEO_LOSS_TIMEOUT_MS) {
      results.push({
        detectionType: "video-loss",
        confidence: 0.99,
        objects: [],
        metadata: {
          lastFrameAgoMs: timeSinceLastFrame,
        },
        requiresAlert: true,
      });
    }

    // Calculate frame brightness
    const brightness = this.calculateBrightness(frame.imageData);
    state.recentBrightness.push(brightness);
    if (state.recentBrightness.length > this.BRIGHTNESS_HISTORY_SIZE) {
      state.recentBrightness.shift();
    }

    // Detect camera tampering (sudden brightness changes, covered lens, etc.)
    if (state.recentBrightness.length >= 10) {
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
    const latest = brightnessHistory[brightnessHistory.length - 1]!;

    // Completely black (covered lens)
    if (avg < 5) {
      return {
        isTampering: true,
        confidence: 0.95,
        type: "covered_lens",
        avgBrightness: avg,
      };
    }

    // Completely white (lens blocked by bright object)
    if (avg > 250) {
      return {
        isTampering: true,
        confidence: 0.95,
        type: "blinded_lens",
        avgBrightness: avg,
      };
    }

    // Sudden dramatic change
    if (brightnessHistory.length >= 20) {
      const recentAvg =
        brightnessHistory.slice(-10).reduce((a, b) => a + b, 0) / 10;
      const olderAvg =
        brightnessHistory.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
      const change = Math.abs(recentAvg - olderAvg);

      if (change > 100) {
        return {
          isTampering: true,
          confidence: 0.80,
          type: "sudden_change",
          avgBrightness: avg,
        };
      }
    }

    // Calculate variance to detect defocus
    const variance =
      brightnessHistory
        .map((b) => Math.pow(b - avg, 2))
        .reduce((a, b) => a + b, 0) / brightnessHistory.length;
    const stdDev = Math.sqrt(variance);

    // Very low variance might indicate defocus or spray
    if (stdDev < 2 && avg > 10 && avg < 245) {
      return {
        isTampering: true,
        confidence: 0.75,
        type: "defocus_or_spray",
        avgBrightness: avg,
      };
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
