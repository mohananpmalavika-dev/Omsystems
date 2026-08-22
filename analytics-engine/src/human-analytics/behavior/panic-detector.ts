/**
 * Crowd Panic Detection
 * Detects crowd anomalies and panic situations using baseline learning
 */

import { randomUUID } from "node:crypto";
import type { PersonTrack, CrowdWindowFeatures, CrowdBaseline, BehaviorEvent } from "../types.js";

interface PanicDetectorConfig {
  windowSizeMs: number;
  minimumPersistenceMs: number;
  suspectedThreshold: number;
  minTrackCount: number;
  baselineWindowHours: number;
}

export class PanicDetector {
  private baselines = new Map<string, CrowdBaseline>();
  private currentWindow: CrowdWindowFeatures | null = null;
  private windowStartTime: Date | null = null;
  private suspectedStartTime: Date | null = null;

  private readonly config: PanicDetectorConfig = {
    windowSizeMs: 3000, // 3 seconds
    minimumPersistenceMs: 2000, // 2 seconds
    suspectedThreshold: 0.7,
    minTrackCount: 5,
    baselineWindowHours: 24,
  };

  constructor(
    private readonly tenantId: string,
    private readonly cameraId: string,
    private readonly zoneId?: string,
    config?: Partial<PanicDetectorConfig>,
  ) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * Analyze crowd for panic indicators
   */
  analyzeCrowd(
    tracks: PersonTrack[],
    timestamp: Date,
  ): BehaviorEvent | null {
    const confirmedTracks = tracks.filter((t) => t.status === "confirmed");

    if (confirmedTracks.length < this.config.minTrackCount) {
      this.resetWindow();
      return null;
    }

    // Extract features for current window
    const features = this.extractCrowdFeatures(confirmedTracks, timestamp);

    // Initialize or update window
    if (!this.windowStartTime) {
      this.windowStartTime = timestamp;
      this.currentWindow = features;
      return null;
    }

    const windowDuration = timestamp.getTime() - this.windowStartTime.getTime();

    // Update current window
    this.currentWindow = features;

    // Get baseline for current time
    const baseline = this.getBaselineForTime(timestamp);

    // Calculate panic score
    const panicScore = this.calculatePanicScore(features, baseline);

    // Check for suspected panic
    if (panicScore >= this.config.suspectedThreshold) {
      if (!this.suspectedStartTime) {
        this.suspectedStartTime = timestamp;
      }

      const suspectedDuration =
        timestamp.getTime() - this.suspectedStartTime.getTime();

      // Require minimum persistence
      if (suspectedDuration >= this.config.minimumPersistenceMs) {
        const event: BehaviorEvent = {
          id: `panic_${randomUUID()}`,
          tenantId: this.tenantId,
          cameraId: this.cameraId,
          type: panicScore >= 0.85 ? "crowd_panic_suspected" : "unusual_crowd_motion",
          startedAt: this.suspectedStartTime,
          endedAt: undefined,
          confidence: panicScore,
          severity: this.calculateSeverity(panicScore),
          trackIds: confirmedTracks.map((t) => t.trackId),
          evidence: {
            frameIds: [],
            featureSummary: {
              activeTrackCount: features.activeTrackCount,
              meanSpeed: features.meanSpeed,
              directionEntropy: features.directionEntropy,
              panicScore,
            },
          },
          provenance: {
            detectorVersion: "panic-detector-v1.0",
            modelVersions: {
              baseline: "baseline-v1.0",
            },
            configurationVersion: "1.0",
          },
          review: {
            status: "unreviewed",
          },
        };

        return event;
      }
    } else {
      // Reset suspected state if score drops
      this.suspectedStartTime = null;
    }

    // Update baseline with normal observations
    if (panicScore < 0.3) {
      this.updateBaseline(features, timestamp);
    }

    return null;
  }

  /**
   * Extract crowd-level features
   */
  private extractCrowdFeatures(
    tracks: PersonTrack[],
    timestamp: Date,
  ): CrowdWindowFeatures {
    const speeds = tracks.map((t) => t.speed || 0);
    const velocities = tracks.map((t) => t.velocity || { dx: 0, dy: 0 });

    // Mean speed
    const meanSpeed = speeds.reduce((sum, s) => sum + s, 0) / speeds.length;

    // Speed acceleration (if we have previous window)
    const speedAcceleration = 0; // Placeholder: would compare with previous window

    // Direction entropy
    const directionEntropy = this.calculateDirectionEntropy(velocities);

    // Velocity variance
    const velocityVariance = this.calculateVariance(speeds);

    // Optical flow magnitude (placeholder: would use dense optical flow)
    const opticalFlowMagnitude = meanSpeed;

    // Dispersion rate
    const dispersionRate = this.calculateDispersionRate(tracks);

    // Fall count
    const fallCount = tracks.filter((t) => t.currentActivity === "crawling").length;

    // Exit convergence (placeholder: would require zone/exit configuration)
    const exitConvergence = 0;

    return {
      activeTrackCount: tracks.length,
      meanSpeed,
      speedAcceleration,
      directionEntropy,
      velocityVariance,
      opticalFlowMagnitude,
      dispersionRate,
      fallCount,
      exitConvergence,
    };
  }

  /**
   * Calculate direction entropy
   */
  private calculateDirectionEntropy(
    velocities: Array<{ dx: number; dy: number }>,
  ): number {
    // Bin directions into 8 sectors (0-360 degrees)
    const bins = new Array(8).fill(0);
    const binSize = 360 / 8;

    for (const vel of velocities) {
      if (vel.dx === 0 && vel.dy === 0) continue;

      const angle = (Math.atan2(vel.dy, vel.dx) * 180) / Math.PI;
      const normalizedAngle = angle < 0 ? angle + 360 : angle;
      const binIndex = Math.floor(normalizedAngle / binSize) % 8;

      bins[binIndex]++;
    }

    // Calculate entropy
    const total = bins.reduce((sum, count) => sum + count, 0);
    if (total === 0) return 0;

    let entropy = 0;
    for (const count of bins) {
      if (count > 0) {
        const p = count / total;
        entropy -= p * Math.log2(p);
      }
    }

    // Normalize to [0, 1]
    const maxEntropy = Math.log2(8);
    return entropy / maxEntropy;
  }

  /**
   * Calculate variance
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map((v) => (v - mean) ** 2);
    return squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length;
  }

  /**
   * Calculate dispersion rate
   */
  private calculateDispersionRate(tracks: PersonTrack[]): number {
    if (tracks.length < 2) return 0;

    // Calculate center of mass
    let centerX = 0;
    let centerY = 0;

    for (const track of tracks) {
      const lastObs = track.observations[track.observations.length - 1];
      centerX += lastObs.footPoint.x;
      centerY += lastObs.footPoint.y;
    }

    centerX /= tracks.length;
    centerY /= tracks.length;

    // Calculate average distance from center
    let totalDistance = 0;

    for (const track of tracks) {
      const lastObs = track.observations[track.observations.length - 1];
      const dx = lastObs.footPoint.x - centerX;
      const dy = lastObs.footPoint.y - centerY;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
    }

    return totalDistance / tracks.length;
  }

  /**
   * Calculate panic score
   */
  private calculatePanicScore(
    features: CrowdWindowFeatures,
    baseline: CrowdBaseline | null,
  ): number {
    if (!baseline) {
      // No baseline, use simple heuristics
      const highSpeed = features.meanSpeed > 100 ? 0.3 : 0;
      const highEntropy = features.directionEntropy > 0.7 ? 0.3 : 0;
      const hasFalls = features.fallCount > 0 ? 0.2 : 0;
      const highDensity = features.activeTrackCount > 10 ? 0.2 : 0;

      return highSpeed + highEntropy + hasFalls + highDensity;
    }

    // Calculate anomalies using MAD (Median Absolute Deviation)
    const densityAnomaly = this.calculateAnomaly(
      features.activeTrackCount,
      baseline.medianDensity || 5,
      baseline.madDensity || 2,
    );

    const speedAnomaly = this.calculateAnomaly(
      features.meanSpeed,
      baseline.medianSpeed,
      baseline.madSpeed,
    );

    const entropyAnomaly = this.calculateAnomaly(
      features.directionEntropy,
      baseline.medianDirectionEntropy,
      baseline.madDirectionEntropy,
    );

    const fallSignal = features.fallCount > 0 ? Math.min(1, features.fallCount / 3) : 0;

    // Weighted panic score
    const panicScore =
      0.15 * densityAnomaly +
      0.25 * speedAnomaly +
      0.25 * entropyAnomaly +
      0.15 * (features.velocityVariance / 100) + // Normalize
      0.10 * fallSignal +
      0.10 * (features.dispersionRate / 100); // Normalize

    return Math.min(1, panicScore);
  }

  /**
   * Calculate anomaly using robust statistics
   */
  private calculateAnomaly(
    value: number,
    median: number,
    mad: number,
  ): number {
    const epsilon = 1e-10;
    const z = (value - median) / (1.4826 * mad + epsilon);

    // Convert z-score to [0, 1] range
    return Math.min(1, Math.max(0, Math.abs(z) / 3));
  }

  /**
   * Get baseline for current time
   */
  private getBaselineForTime(timestamp: Date): CrowdBaseline | null {
    const dayOfWeek = timestamp.getDay();
    const hourOfDay = timestamp.getHours();

    const key = `${dayOfWeek}_${hourOfDay}`;
    return this.baselines.get(key) || null;
  }

  /**
   * Update baseline with normal observations
   */
  private updateBaseline(features: CrowdWindowFeatures, timestamp: Date): void {
    const dayOfWeek = timestamp.getDay();
    const hourOfDay = timestamp.getHours();
    const key = `${dayOfWeek}_${hourOfDay}`;

    let baseline = this.baselines.get(key);

    if (!baseline) {
      baseline = {
        cameraId: this.cameraId,
        zoneId: this.zoneId,
        dayOfWeek,
        hourOfDay,
        medianSpeed: features.meanSpeed,
        medianDensity: features.activeTrackCount,
        medianDirectionEntropy: features.directionEntropy,
        madSpeed: 0,
        madDensity: 0,
        madDirectionEntropy: 0,
        sampleCount: 1,
        lastUpdated: timestamp,
      };
    } else {
      // Update using exponential moving average
      const alpha = 0.1;
      baseline.medianSpeed = alpha * features.meanSpeed + (1 - alpha) * baseline.medianSpeed;
      baseline.medianDensity =
        alpha * features.activeTrackCount + (1 - alpha) * baseline.medianDensity;
      baseline.medianDirectionEntropy =
        alpha * features.directionEntropy + (1 - alpha) * baseline.medianDirectionEntropy;

      // Update MAD (simplified)
      baseline.madSpeed =
        alpha * Math.abs(features.meanSpeed - baseline.medianSpeed) +
        (1 - alpha) * baseline.madSpeed;
      baseline.madDensity =
        alpha * Math.abs(features.activeTrackCount - baseline.medianDensity) +
        (1 - alpha) * baseline.madDensity;
      baseline.madDirectionEntropy =
        alpha * Math.abs(features.directionEntropy - baseline.medianDirectionEntropy) +
        (1 - alpha) * baseline.madDirectionEntropy;

      baseline.sampleCount++;
      baseline.lastUpdated = timestamp;
    }

    this.baselines.set(key, baseline);
  }

  /**
   * Calculate severity
   */
  private calculateSeverity(panicScore: number): "low" | "medium" | "high" | "critical" {
    if (panicScore >= 0.9) return "critical";
    if (panicScore >= 0.8) return "high";
    if (panicScore >= 0.7) return "medium";
    return "low";
  }

  /**
   * Reset window
   */
  private resetWindow(): void {
    this.windowStartTime = null;
    this.currentWindow = null;
    this.suspectedStartTime = null;
  }

  /**
   * Get baselines
   */
  getBaselines(): CrowdBaseline[] {
    return Array.from(this.baselines.values());
  }

  /**
   * Import baseline (for initialization)
   */
  importBaseline(baseline: CrowdBaseline): void {
    const key = `${baseline.dayOfWeek}_${baseline.hourOfDay}`;
    this.baselines.set(key, baseline);
  }
}
