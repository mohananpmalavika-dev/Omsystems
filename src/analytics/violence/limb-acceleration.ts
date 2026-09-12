/**
 * Rapid Limb Acceleration & Kinematic Jerk Analyzer
 * 
 * Tracks spatial keypoints or bounding box limb proxies over discrete time intervals
 * to isolate ballistic strikes (punches, kicks, shoves) from continuous non-violent motion.
 */

export interface KeypointPosition {
  x: number;
  y: number;
  confidence?: number;
}

export interface TrackObservation {
  timestamp: number; // milliseconds
  boundingBox: { x: number; y: number; width: number; height: number };
  keypoints?: {
    leftWrist?: KeypointPosition;
    rightWrist?: KeypointPosition;
    leftElbow?: KeypointPosition;
    rightElbow?: KeypointPosition;
    leftShoulder?: KeypointPosition;
    rightShoulder?: KeypointPosition;
    leftAnkle?: KeypointPosition;
    rightAnkle?: KeypointPosition;
  };
}

export interface KinematicVector {
  vx: number;
  vy: number;
  speed: number;
  ax: number;
  ay: number;
  acceleration: number; // pixels/s^2
  jerk: number; // pixels/s^3
}

export interface StrikeEvent {
  limb: string;
  peakAcceleration: number;
  jerkImpulse: number;
  direction: { x: number; y: number };
  timestamp: number;
  confidence: number;
}

export interface LimbKinematicsSummary {
  trackId: string;
  peakAcceleration: number;
  averageAcceleration: number;
  maxJerk: number;
  detectedStrikes: StrikeEvent[];
  erraticMotionScore: number; // [0, 1]
}

export class LimbAccelerationAnalyzer {
  private readonly strikeAccelThreshold: number; // Minimum acceleration for a strike (px/s^2)
  private readonly minConfidence: number;

  constructor(options?: { strikeAccelThreshold?: number; minConfidence?: number }) {
    this.strikeAccelThreshold = options?.strikeAccelThreshold ?? 35.0;
    this.minConfidence = options?.minConfidence ?? 0.4;
  }

  /**
   * Analyze kinematic motion trajectory across a sliding history of observations
   */
  public analyzeTrajectory(
    trackId: string,
    history: TrackObservation[]
  ): LimbKinematicsSummary {
    if (history.length < 3) {
      return {
        trackId,
        peakAcceleration: 0,
        averageAcceleration: 0,
        maxJerk: 0,
        detectedStrikes: [],
        erraticMotionScore: 0,
      };
    }

    const strikes: StrikeEvent[] = [];
    let peakOverallAccel = 0;
    let accelSum = 0;
    let accelCount = 0;
    let maxOverallJerk = 0;

    // Defined limbs to inspect
    const limbNames: Array<'leftWrist' | 'rightWrist' | 'leftElbow' | 'rightElbow' | 'leftAnkle' | 'rightAnkle'> = [
      'leftWrist',
      'rightWrist',
      'leftElbow',
      'rightElbow',
      'leftAnkle',
      'rightAnkle',
    ];

    let hasPoseKeypoints = false;

    // Check if keypoints are present in the latest frames
    const latest = history[history.length - 1];
    if (latest?.keypoints && (latest.keypoints.leftWrist || latest.keypoints.rightWrist)) {
      hasPoseKeypoints = true;
    }

    if (hasPoseKeypoints) {
      for (const limb of limbNames) {
        const limbTrajectory: Array<{ pos: KeypointPosition; t: number }> = [];

        for (const obs of history) {
          const pt = obs.keypoints?.[limb];
          if (pt && (pt.confidence === undefined || pt.confidence >= this.minConfidence)) {
            limbTrajectory.push({ pos: pt, t: obs.timestamp / 1000.0 }); // Convert to seconds
          }
        }

        if (limbTrajectory.length >= 3) {
          const analysis = this.evaluateLimbKinematics(limb, limbTrajectory);
          if (analysis.peakAcceleration > peakOverallAccel) {
            peakOverallAccel = analysis.peakAcceleration;
          }
          if (analysis.maxJerk > maxOverallJerk) {
            maxOverallJerk = analysis.maxJerk;
          }
          accelSum += analysis.averageAcceleration;
          accelCount++;
          strikes.push(...analysis.strikes);
        }
      }
    } else {
      // Fallback to bounding box upper quadrant motion proxies (wrists/upper body proxy)
      const upperLeftProxy: Array<{ pos: KeypointPosition; t: number }> = [];
      const upperRightProxy: Array<{ pos: KeypointPosition; t: number }> = [];

      for (const obs of history) {
        const t = obs.timestamp / 1000.0;
        const b = obs.boundingBox;
        // Upper left corner proxy (left arm / shoulder)
        upperLeftProxy.push({ pos: { x: b.x, y: b.y + b.height * 0.25 }, t });
        // Upper right corner proxy (right arm / shoulder)
        upperRightProxy.push({ pos: { x: b.x + b.width, y: b.y + b.height * 0.25 }, t });
      }

      const leftAnalysis = this.evaluateLimbKinematics('upper_left_torso', upperLeftProxy);
      const rightAnalysis = this.evaluateLimbKinematics('upper_right_torso', upperRightProxy);

      peakOverallAccel = Math.max(leftAnalysis.peakAcceleration, rightAnalysis.peakAcceleration);
      maxOverallJerk = Math.max(leftAnalysis.maxJerk, rightAnalysis.maxJerk);
      accelSum = leftAnalysis.averageAcceleration + rightAnalysis.averageAcceleration;
      accelCount = 2;
      strikes.push(...leftAnalysis.strikes, ...rightAnalysis.strikes);
    }

    const avgAccel = accelCount > 0 ? accelSum / accelCount : 0;

    // Erratic motion score reflects presence of high-acceleration spikes relative to baseline
    const erraticScore = Math.min(
      1.0,
      (peakOverallAccel / (this.strikeAccelThreshold * 1.5)) * 0.5 +
        Math.min(1.0, strikes.length * 0.25) +
        Math.min(1.0, (maxOverallJerk / (this.strikeAccelThreshold * 5.0)) * 0.25)
    );

    return {
      trackId,
      peakAcceleration: Number(peakOverallAccel.toFixed(2)),
      averageAcceleration: Number(avgAccel.toFixed(2)),
      maxJerk: Number(maxOverallJerk.toFixed(2)),
      detectedStrikes: strikes,
      erraticMotionScore: Number(erraticScore.toFixed(4)),
    };
  }

  private evaluateLimbKinematics(
    limb: string,
    points: Array<{ pos: KeypointPosition; t: number }>
  ): {
    peakAcceleration: number;
    averageAcceleration: number;
    maxJerk: number;
    strikes: StrikeEvent[];
  } {
    const velocities: Array<{ vx: number; vy: number; speed: number; t: number }> = [];
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1]!;
      const p1 = points[i]!;
      const dt = p1.t - p0.t;
      if (dt > 0.005 && dt < 1.0) {
        const vx = (p1.pos.x - p0.pos.x) / dt;
        const vy = (p1.pos.y - p0.pos.y) / dt;
        velocities.push({ vx, vy, speed: Math.sqrt(vx * vx + vy * vy), t: (p0.t + p1.t) / 2 });
      }
    }

    const accelerations: Array<{ ax: number; ay: number; accel: number; t: number; vx: number; vy: number }> = [];
    for (let i = 1; i < velocities.length; i++) {
      const v0 = velocities[i - 1]!;
      const v1 = velocities[i]!;
      const dt = v1.t - v0.t;
      if (dt > 0.005 && dt < 1.0) {
        const ax = (v1.vx - v0.vx) / dt;
        const ay = (v1.vy - v0.vy) / dt;
        accelerations.push({
          ax,
          ay,
          accel: Math.sqrt(ax * ax + ay * ay),
          t: (v0.t + v1.t) / 2,
          vx: v1.vx,
          vy: v1.vy,
        });
      }
    }

    let peakAccel = 0;
    let accelSum = 0;
    let maxJerk = 0;
    const strikes: StrikeEvent[] = [];

    for (let i = 0; i < accelerations.length; i++) {
      const a = accelerations[i]!;
      accelSum += a.accel;
      if (a.accel > peakAccel) {
        peakAccel = a.accel;
      }

      // Calculate jerk from acceleration change
      let jerk = 0;
      if (i > 0) {
        const prevA = accelerations[i - 1]!;
        const dt = a.t - prevA.t;
        if (dt > 0.005) {
          const djx = (a.ax - prevA.ax) / dt;
          const djy = (a.ay - prevA.ay) / dt;
          jerk = Math.sqrt(djx * djx + djy * djy);
          if (jerk > maxJerk) {
            maxJerk = jerk;
          }
        }
      }

      // Identify ballistic strikes: high acceleration (+ significant jerk impulse if multiple frames available)
      const isBallistic = a.accel >= this.strikeAccelThreshold && (jerk >= this.strikeAccelThreshold * 1.2 || accelerations.length <= 2);
      if (isBallistic) {
        const speed = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
        strikes.push({
          limb,
          peakAcceleration: Number(a.accel.toFixed(2)),
          jerkImpulse: Number(jerk.toFixed(2)),
          direction: speed > 0 ? { x: Number((a.vx / speed).toFixed(3)), y: Number((a.vy / speed).toFixed(3)) } : { x: 0, y: 0 },
          timestamp: Math.round(a.t * 1000),
          confidence: Math.min(0.99, Number((a.accel / (this.strikeAccelThreshold * 2)).toFixed(2))),
        });
      }
    }

    const avgAccel = accelerations.length > 0 ? accelSum / accelerations.length : 0;

    return {
      peakAcceleration: peakAccel,
      averageAcceleration: avgAccel,
      maxJerk,
      strikes,
    };
  }
}
