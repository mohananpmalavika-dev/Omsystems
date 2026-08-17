/**
 * Stream Health Evaluator & Watchdogs
 * Evaluates frame age, keyframe age, packet loss, FPS ratio, and substream fallback.
 */

import { StreamRuntimeStatus } from './stream-metrics.js';
import { StreamState } from './stream-state-machine.js';

export enum StreamHealth {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY',
  UNKNOWN = 'UNKNOWN',
}

export interface StreamHealthEvaluation {
  health: StreamHealth;
  recommendedState?: StreamState;
  reasons: string[];
  frameAgeMs?: number;
  keyframeAgeMs?: number;
  fpsRatio?: number;
}

export interface StreamHealthThresholds {
  frameDegradedMs: number; // 5,000ms
  frameFailureMs: number; // 10,000ms
  keyframeDegradedMs: number; // 30,000ms
  keyframeFailureMs: number; // 60,000ms
  packetLossDegradedPct: number; // 1%
  packetLossFailurePct: number; // 5%
  minFpsHealthyRatio: number; // 0.80 (80% of expected FPS)
  minFpsDegradedRatio: number; // 0.50 (50% of expected FPS)
}

export const DEFAULT_STREAM_THRESHOLDS: StreamHealthThresholds = {
  frameDegradedMs: 5000,
  frameFailureMs: 10000,
  keyframeDegradedMs: 30000,
  keyframeFailureMs: 60000,
  packetLossDegradedPct: 1.0,
  packetLossFailurePct: 5.0,
  minFpsHealthyRatio: 0.8,
  minFpsDegradedRatio: 0.5,
};

export class StreamHealthEvaluator {
  constructor(private readonly thresholds: StreamHealthThresholds = DEFAULT_STREAM_THRESHOLDS) {}

  /**
   * Evaluate runtime status against watchdog thresholds.
   */
  evaluate(status: StreamRuntimeStatus, nowMs: number = Date.now()): StreamHealthEvaluation {
    const reasons: string[] = [];

    if (status.state === StreamState.DISCONNECTED || status.state === StreamState.FAILED) {
      return { health: StreamHealth.UNHEALTHY, reasons: ['Stream is disconnected or failed'] };
    }

    if (status.state === StreamState.CONNECTING || status.state === StreamState.AUTHENTICATING) {
      return { health: StreamHealth.UNKNOWN, reasons: ['Connection is still establishing'] };
    }

    // 1. Frame Watchdog Check
    const frameAgeMs = status.lastFrameAt ? nowMs - status.lastFrameAt.getTime() : Infinity;
    if (frameAgeMs > this.thresholds.frameFailureMs) {
      reasons.push(`Frame frozen for ${(frameAgeMs / 1000).toFixed(1)}s (exceeds ${this.thresholds.frameFailureMs / 1000}s limit)`);
      return {
        health: StreamHealth.UNHEALTHY,
        recommendedState: StreamState.RECONNECTING,
        reasons,
        frameAgeMs,
      };
    }

    let isDegraded = false;
    if (frameAgeMs > this.thresholds.frameDegradedMs) {
      isDegraded = true;
      reasons.push(`Frame delayed by ${(frameAgeMs / 1000).toFixed(1)}s`);
    }

    // 2. Keyframe Watchdog Check
    const keyframeAgeMs = status.lastKeyframeAt ? nowMs - status.lastKeyframeAt.getTime() : Infinity;
    if (keyframeAgeMs > this.thresholds.keyframeFailureMs) {
      reasons.push(`No keyframe received for ${(keyframeAgeMs / 1000).toFixed(1)}s`);
      return {
        health: StreamHealth.UNHEALTHY,
        recommendedState: StreamState.RECONNECTING,
        reasons,
        keyframeAgeMs,
      };
    }

    if (keyframeAgeMs > this.thresholds.keyframeDegradedMs) {
      isDegraded = true;
      reasons.push(`Keyframe interval elevated (${(keyframeAgeMs / 1000).toFixed(1)}s)`);
    }

    // 3. FPS Ratio Check
    let fpsRatio: number | undefined;
    if (status.fps !== undefined && status.expectedFps > 0) {
      fpsRatio = status.fps / status.expectedFps;
      if (fpsRatio < this.thresholds.minFpsDegradedRatio) {
        isDegraded = true;
        reasons.push(`Severe FPS drop: ${status.fps} FPS (expected ${status.expectedFps} FPS)`);
      } else if (fpsRatio < this.thresholds.minFpsHealthyRatio) {
        isDegraded = true;
        reasons.push(`Sub-optimal FPS: ${status.fps} FPS (expected ${status.expectedFps} FPS)`);
      }
    }

    // 4. Packet Loss Check
    if (status.packetLossPercent !== undefined) {
      if (status.packetLossPercent >= this.thresholds.packetLossFailurePct) {
        isDegraded = true;
        reasons.push(`Critical packet loss: ${status.packetLossPercent.toFixed(1)}%`);
      } else if (status.packetLossPercent >= this.thresholds.packetLossDegradedPct) {
        isDegraded = true;
        reasons.push(`Moderate packet loss: ${status.packetLossPercent.toFixed(1)}%`);
      }
    }

    if (isDegraded) {
      return {
        health: StreamHealth.DEGRADED,
        recommendedState: StreamState.DEGRADED,
        reasons,
        frameAgeMs,
        keyframeAgeMs,
        fpsRatio,
      };
    }

    return {
      health: StreamHealth.HEALTHY,
      recommendedState: StreamState.STREAMING,
      reasons: ['Stream is active, receiving keyframes and continuous frames at expected bitrate and FPS'],
      frameAgeMs,
      keyframeAgeMs,
      fpsRatio,
    };
  }
}
