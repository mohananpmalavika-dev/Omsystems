/**
 * Fall Kinematic State Machine & False Positive Filter
 * 
 * Tracks temporal state progression:
 * UPRIGHT -> DESCENT -> IMPACT -> POST_FALL_MOTIONLESS -> RECOVERED / UNRESPONSIVE_EMERGENCY
 * with discrimination for intentional sitting, bending, and kneeling.
 */

import type { FallDetectorConfig, PersonCategory, FallType } from './types.js';
import type { AspectRatioMetrics } from './aspect-ratio-dynamics.js';
import type { PoseKinematicsMetrics } from './pose-kinematics.js';

export type KinematicPhase =
  | 'UPRIGHT'
  | 'DESCENT'
  | 'IMPACT'
  | 'POST_FALL_MOTIONLESS'
  | 'RECOVERED'
  | 'SUPPRESSED_INTENTIONAL';

export interface TrackFallState {
  trackId: string;
  category: PersonCategory;
  phase: KinematicPhase;
  firstObservedAt: number;
  descentStartedAt?: number;
  impactOccurredAt?: number;
  motionlessStartedAt?: number;
  recoveredAt?: number;
  peakVelocityY: number;
  peakAspectRatio: number;
  minTorsoAngle: number | null;
  fallType: FallType;
  motionlessDurationSeconds: number;
  recoveryDetected: boolean;
  recoveryTimeSeconds: number | null;
  suppressionReason?: string;
  history: string[];
}

export class FallStateMachine {
  private readonly config: FallDetectorConfig;
  private readonly trackStates = new Map<string, TrackFallState>();

  constructor(config: FallDetectorConfig) {
    this.config = config;
  }

  /**
   * Update track state given latest kinematic metrics
   */
  public update(
    trackId: string,
    timestamp: number,
    category: PersonCategory,
    arMetrics: AspectRatioMetrics,
    poseMetrics: PoseKinematicsMetrics
  ): TrackFallState {
    let state = this.trackStates.get(trackId);
    if (!state) {
      state = {
        trackId,
        category,
        phase: 'UPRIGHT',
        firstObservedAt: timestamp,
        peakVelocityY: 0,
        peakAspectRatio: arMetrics.currentAspectRatio,
        minTorsoAngle: poseMetrics.torsoAngleDegrees,
        fallType: 'unknown',
        motionlessDurationSeconds: 0,
        recoveryDetected: false,
        recoveryTimeSeconds: null,
        history: ['INIT_UPRIGHT'],
      };
      this.trackStates.set(trackId, state);
    }

    // Keep peaks updated
    if (arMetrics.verticalVelocity > state.peakVelocityY) {
      state.peakVelocityY = arMetrics.verticalVelocity;
    }
    if (arMetrics.peakAspectRatio > state.peakAspectRatio) {
      state.peakAspectRatio = arMetrics.peakAspectRatio;
    }
    if (poseMetrics.torsoAngleDegrees !== null) {
      if (state.minTorsoAngle === null || poseMetrics.torsoAngleDegrees < state.minTorsoAngle) {
        state.minTorsoAngle = poseMetrics.torsoAngleDegrees;
      }
    }
    if (poseMetrics.fallDirection !== 'unknown' && state.fallType === 'unknown') {
      state.fallType = poseMetrics.fallDirection;
    }

    // Dynamic thresholds based on profile (Worker vs Elderly)
    const velThreshold = this.config.profile === 'elderly'
      ? this.config.velocityThreshold * 0.70 // Elderly falls are often slower slips/slumps
      : this.config.velocityThreshold; // Worker falls are often high-velocity slips/ladder drops

    const arThreshold = this.config.aspectRatioThreshold;
    const torsoThreshold = this.config.torsoAngleThreshold;

    const isRecumbent = arMetrics.isHorizontallyOriented || poseMetrics.isTorsoHorizontal;
    const isUpright = arMetrics.currentAspectRatio < 0.85 &&
      (poseMetrics.torsoAngleDegrees === null || poseMetrics.torsoAngleDegrees > 60);

    // 1. False Positive Suppression Check: Intentional Sitting
    // In sitting, aspect ratio is typically between 0.7 and 1.15, torso angle remains upright (> 55°),
    // and downward descent velocity is smooth and controlled.
    if (
      (state.phase === 'UPRIGHT' || state.phase === 'DESCENT') &&
      arMetrics.currentAspectRatio < 1.15 &&
      poseMetrics.torsoAngleDegrees !== null &&
      poseMetrics.torsoAngleDegrees >= 50 &&
      arMetrics.verticalVelocity < velThreshold * 1.5
    ) {
      if (arMetrics.currentAspectRatio > 0.80 && arMetrics.postImpactMotionEnergy < 3.0) {
        state.phase = 'SUPPRESSED_INTENTIONAL';
        state.suppressionReason = 'Controlled sitting posture detected (upright torso, non-recumbent aspect ratio)';
        state.history.push(`SUPPRESSED_SITTING@${timestamp}`);
        return state;
      }
    }

    // 2. False Positive Suppression Check: Intentional Bending
    // In bending down, torso angle dips, but if within 2-3 seconds the person is upright again,
    // it was a momentary bend rather than a debilitating fall.
    if (state.phase === 'SUPPRESSED_INTENTIONAL' && isUpright) {
      state.phase = 'UPRIGHT';
      state.history.push(`UPRIGHT_AFTER_SUPPRESSION@${timestamp}`);
      return state;
    }

    // State Transitions
    switch (state.phase) {
      case 'UPRIGHT': {
        // Detect sudden descent phase
        const rapidDescent = arMetrics.verticalVelocity >= velThreshold;
        const rapidAspectWidening = arMetrics.aspectRatioVelocity > 0.8;
        const suddenTilt = poseMetrics.torsoAngleDegrees !== null && poseMetrics.torsoAngleDegrees < 50;

        if (isRecumbent && (rapidDescent || rapidAspectWidening || arMetrics.isHorizontallyOriented || arMetrics.centroidDescentDistance > 20)) {
          state.phase = 'IMPACT';
          state.impactOccurredAt = timestamp;
          state.motionlessStartedAt = timestamp;
          state.history.push(`DIRECT_IMPACT@${timestamp}`);
        } else if (rapidDescent || (rapidAspectWidening && isRecumbent) || (suddenTilt && isRecumbent)) {
          state.phase = 'DESCENT';
          state.descentStartedAt = timestamp;
          state.history.push(`DESCENT@${timestamp}`);
        }
        break;
      }

      case 'DESCENT': {
        // Did the person hit ground and become recumbent?
        if (isRecumbent) {
          state.phase = 'IMPACT';
          state.impactOccurredAt = timestamp;
          state.motionlessStartedAt = timestamp;
          state.history.push(`IMPACT@${timestamp}`);
        } else if (isUpright) {
          state.phase = 'RECOVERED';
          state.recoveryDetected = true;
          state.recoveredAt = timestamp;
          state.recoveryTimeSeconds = state.descentStartedAt
            ? Number(((timestamp - state.descentStartedAt) / 1000).toFixed(1))
            : 0;
          state.history.push(`RECOVERED_AFTER_DESCENT@${timestamp}`);
        }
        break;
      }

      case 'IMPACT': {
        // Check for transition to motionless state
        if (isRecumbent) {
          if (!state.motionlessStartedAt) {
            state.motionlessStartedAt = state.impactOccurredAt || timestamp;
          }
          const duration = (timestamp - state.motionlessStartedAt) / 1000;
          state.motionlessDurationSeconds = Number(duration.toFixed(1));

          if (duration >= this.config.motionlessDelaySeconds) {
            state.phase = 'POST_FALL_MOTIONLESS';
            state.history.push(`MOTIONLESS_CONFIRMED@${timestamp}`);
          }
        } else if (isUpright) {
          // Quick immediate recovery
          state.phase = 'RECOVERED';
          state.recoveryDetected = true;
          state.recoveredAt = timestamp;
          state.recoveryTimeSeconds = state.impactOccurredAt
            ? Number(((timestamp - state.impactOccurredAt) / 1000).toFixed(1))
            : 0;
          state.history.push(`IMMEDIATE_RECOVERY@${timestamp}`);
        }
        break;
      }

      case 'POST_FALL_MOTIONLESS': {
        if (isRecumbent) {
          if (state.motionlessStartedAt) {
            state.motionlessDurationSeconds = Number(((timestamp - state.motionlessStartedAt) / 1000).toFixed(1));
          }
        } else if (isUpright) {
          // Person managed to stand back up after being down
          state.phase = 'RECOVERED';
          state.recoveryDetected = true;
          state.recoveredAt = timestamp;
          state.recoveryTimeSeconds = state.impactOccurredAt
            ? Number(((timestamp - state.impactOccurredAt) / 1000).toFixed(1))
            : null;
          state.history.push(`POST_MOTIONLESS_RECOVERY@${timestamp}`);
        }
        break;
      }

      case 'RECOVERED': {
        // If person falls again
        if (isRecumbent && arMetrics.verticalVelocity >= velThreshold) {
          state.phase = 'DESCENT';
          state.descentStartedAt = timestamp;
          state.recoveryDetected = false;
          state.history.push(`SECONDARY_FALL@${timestamp}`);
        }
        break;
      }

      case 'SUPPRESSED_INTENTIONAL': {
        // If from sitting they actually topple or fall off chair
        if (isRecumbent && arMetrics.currentAspectRatio > 1.30 && (poseMetrics.torsoAngleDegrees ?? 0) < 30) {
          state.phase = 'IMPACT';
          state.impactOccurredAt = timestamp;
          state.suppressionReason = undefined;
          state.history.push(`FALL_FROM_SEATED@${timestamp}`);
        }
        break;
      }
    }

    return state;
  }

  /**
   * Clean up old stale tracks (> 60s)
   */
  public pruneStale(now: number, maxAgeMs = 60_000): void {
    for (const [id, s] of this.trackStates.entries()) {
      if (now - s.firstObservedAt > maxAgeMs && (s.phase === 'UPRIGHT' || s.phase === 'RECOVERED')) {
        this.trackStates.delete(id);
      }
    }
  }

  public getState(trackId: string): TrackFallState | undefined {
    return this.trackStates.get(trackId);
  }
}
