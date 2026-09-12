/**
 * Bounding Box Aspect Ratio Dynamics & Kinematics Analyzer
 * 
 * Computes dimensional ratio inversion (width/height), centroid descent speed,
 * vertical acceleration, ground contact deceleration shock, and motionless immobility.
 */

import type { BoundingBox, TrackObservation } from './types.js';

export interface AspectRatioMetrics {
  currentAspectRatio: number;
  peakAspectRatio: number;
  aspectRatioVelocity: number; // per second rate of ratio change
  verticalVelocity: number; // downward speed (normalized or px/s)
  verticalAcceleration: number; // downward acceleration / impact deceleration
  isHorizontallyOriented: boolean;
  centroidDescentDistance: number;
  postImpactMotionEnergy: number; // residual movement
  baseFloorY: number; // y + height
}

export class AspectRatioDynamicsAnalyzer {
  private readonly aspectRatioThreshold: number;

  constructor(options?: { aspectRatioThreshold?: number }) {
    this.aspectRatioThreshold = options?.aspectRatioThreshold ?? 1.20;
  }

  /**
   * Analyze the temporal sequence of bounding boxes for a track
   */
  public analyzeTrajectory(observations: TrackObservation[]): AspectRatioMetrics {
    if (!observations || observations.length === 0) {
      return {
        currentAspectRatio: 0.4,
        peakAspectRatio: 0.4,
        aspectRatioVelocity: 0,
        verticalVelocity: 0,
        verticalAcceleration: 0,
        isHorizontallyOriented: false,
        centroidDescentDistance: 0,
        postImpactMotionEnergy: 0,
        baseFloorY: 0,
      };
    }

    if (observations.length === 1) {
      const box = observations[0]!.boundingBox;
      const ar = box.height > 0 ? box.width / box.height : 0.5;
      return {
        currentAspectRatio: ar,
        peakAspectRatio: ar,
        aspectRatioVelocity: 0,
        verticalVelocity: 0,
        verticalAcceleration: 0,
        isHorizontallyOriented: ar >= this.aspectRatioThreshold,
        centroidDescentDistance: 0,
        postImpactMotionEnergy: 0,
        baseFloorY: box.y + box.height,
      };
    }

    // Sort chronologically
    const sorted = [...observations].sort((a, b) => a.timestamp - b.timestamp);
    const n = sorted.length;
    const latest = sorted[n - 1]!;
    const prev = sorted[n - 2]!;

    const currentBox = latest.boundingBox;
    const prevBox = prev.boundingBox;

    const currentAR = currentBox.height > 0 ? currentBox.width / currentBox.height : 0.5;
    const prevAR = prevBox.height > 0 ? prevBox.width / prevBox.height : 0.5;

    // Peak AR over trajectory
    let peakAR = currentAR;
    for (const obs of sorted) {
      const ar = obs.boundingBox.height > 0 ? obs.boundingBox.width / obs.boundingBox.height : 0.5;
      if (ar > peakAR) peakAR = ar;
    }

    const dtSeconds = Math.max(0.01, (latest.timestamp - prev.timestamp) / 1000);
    const arVelocity = (currentAR - prevAR) / dtSeconds;

    // Centroids
    const currentCentroidY = currentBox.y + currentBox.height / 2;
    const prevCentroidY = prevBox.y + prevBox.height / 2;

    const verticalVelocity = (currentCentroidY - prevCentroidY) / dtSeconds;

    // Calculate acceleration if we have at least 3 points
    let verticalAcceleration = 0;
    if (n >= 3) {
      const prevPrev = sorted[n - 3]!;
      const prevDt = Math.max(0.01, (prev.timestamp - prevPrev.timestamp) / 1000);
      const prevPrevCentroidY = prevPrev.boundingBox.y + prevPrev.boundingBox.height / 2;
      const prevVelY = (prevCentroidY - prevPrevCentroidY) / prevDt;
      verticalAcceleration = (verticalVelocity - prevVelY) / dtSeconds;
    }

    // Total descent distance from initial upright observation to current
    const initialBox = sorted[0]!.boundingBox;
    const initialCentroidY = initialBox.y + initialBox.height / 2;
    const centroidDescentDistance = Math.max(0, currentCentroidY - initialCentroidY);

    // Compute post-impact motion energy across the last 3-5 frames (centroid displacement)
    let motionEnergy = 0;
    const tailCount = Math.min(5, n);
    const tail = sorted.slice(n - tailCount);
    for (let i = 1; i < tail.length; i++) {
      const b1 = tail[i - 1]!.boundingBox;
      const b2 = tail[i]!.boundingBox;
      const dx = (b2.x + b2.width / 2) - (b1.x + b1.width / 2);
      const dy = (b2.y + b2.height / 2) - (b1.y + b1.height / 2);
      motionEnergy += Math.sqrt(dx * dx + dy * dy);
    }
    const avgMotionEnergy = tailCount > 1 ? motionEnergy / (tailCount - 1) : 0;

    return {
      currentAspectRatio: Number(currentAR.toFixed(3)),
      peakAspectRatio: Number(peakAR.toFixed(3)),
      aspectRatioVelocity: Number(arVelocity.toFixed(3)),
      verticalVelocity: Number(verticalVelocity.toFixed(3)),
      verticalAcceleration: Number(verticalAcceleration.toFixed(3)),
      isHorizontallyOriented: currentAR >= this.aspectRatioThreshold,
      centroidDescentDistance: Number(centroidDescentDistance.toFixed(3)),
      postImpactMotionEnergy: Number(avgMotionEnergy.toFixed(3)),
      baseFloorY: Number((currentBox.y + currentBox.height).toFixed(3)),
    };
  }
}
