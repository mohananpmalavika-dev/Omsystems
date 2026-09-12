/**
 * Production-Ready Worker/Elderly Fall Detector
 * 
 * Fuses human pose kinematics, bounding box aspect ratio inversion,
 * vertical descent velocity/acceleration, and post-fall immobility timers.
 */

import type {
  FallDetectorConfig,
  FallDetectionInput,
  FallDetectionResult,
  FallType,
  PersonCategory,
  BoundingBox,
} from './types.js';
import { AspectRatioDynamicsAnalyzer } from './aspect-ratio-dynamics.js';
import { PoseKinematicsAnalyzer } from './pose-kinematics.js';
import { FallStateMachine, type TrackFallState } from './fall-state-machine.js';

export class FallDetector {
  private readonly config: FallDetectorConfig;
  private readonly arAnalyzer: AspectRatioDynamicsAnalyzer;
  private readonly poseAnalyzer: PoseKinematicsAnalyzer;
  private readonly stateMachine: FallStateMachine;

  // Track alert dispatch history to avoid spamming alerts for the same continuous incident
  private readonly alertedTracks = new Set<string>();

  constructor(config?: Partial<FallDetectorConfig>) {
    this.config = {
      profile: config?.profile ?? 'worker',
      sensitivity: config?.sensitivity ?? 0.75,
      minConfidence: config?.minConfidence ?? 0.65,
      aspectRatioThreshold: config?.aspectRatioThreshold ?? 1.20,
      velocityThreshold: config?.velocityThreshold ?? 0.150,
      torsoAngleThreshold: config?.torsoAngleThreshold ?? 35.0,
      motionlessDelaySeconds: config?.motionlessDelaySeconds ?? 3.0,
      recoveryTimeoutSeconds: config?.recoveryTimeoutSeconds ?? 15.0,
      alertSeverity: config?.alertSeverity ?? 'P1',
    };

    this.arAnalyzer = new AspectRatioDynamicsAnalyzer({
      aspectRatioThreshold: this.config.aspectRatioThreshold,
    });
    this.poseAnalyzer = new PoseKinematicsAnalyzer({
      torsoAngleThreshold: this.config.torsoAngleThreshold,
    });
    this.stateMachine = new FallStateMachine(this.config);
  }

  /**
   * Analyze input frame and active person tracks
   */
  public analyze(input: FallDetectionInput): FallDetectionResult[] {
    const results: FallDetectionResult[] = [];
    const timestamp = input.timestamp;

    for (const track of input.activeTracks) {
      if (!track.observations || track.observations.length === 0) {
        continue;
      }

      const observations = track.observations;
      const latestObs = observations[observations.length - 1]!;
      const category: PersonCategory = track.category || this.config.profile;

      // 1. Aspect Ratio Kinematics
      const arMetrics = this.arAnalyzer.analyzeTrajectory(observations);

      // 2. Pose Kinematics
      const poseMetrics = this.poseAnalyzer.analyzePose(latestObs.keypoints);

      // 3. State Machine Update
      const state = this.stateMachine.update(
        track.trackId,
        timestamp,
        category,
        arMetrics,
        poseMetrics
      );

      // Check if this track is experiencing a fall
      const isFalling =
        state.phase === 'IMPACT' ||
        state.phase === 'POST_FALL_MOTIONLESS' ||
        state.phase === 'DESCENT' ||
        (state.phase === 'RECOVERED' && state.recoveryTimeSeconds !== null);

      if (isFalling) {
        // Calculate multi-factor confidence
        const confidence = this.computeConfidence(arMetrics, poseMetrics, state);

        if (confidence >= this.config.minConfidence) {
          // Determine severity
          let severity = this.config.alertSeverity;
          if (state.phase === 'POST_FALL_MOTIONLESS' && state.motionlessDurationSeconds >= this.config.motionlessDelaySeconds) {
            severity = 'P1'; // Highest urgency: person is down and unresponsive
          } else if (state.phase === 'RECOVERED') {
            severity = 'P3'; // Person fell but got back up
          } else if (state.phase === 'IMPACT') {
            severity = 'P2'; // Initial impact detected
          }

          // Alert required if not already alerted or escalated to P1
          const shouldAlert = !this.alertedTracks.has(track.trackId) ||
            (severity === 'P1' && state.phase === 'POST_FALL_MOTIONLESS');

          if (shouldAlert && state.phase !== 'RECOVERED') {
            this.alertedTracks.add(track.trackId);
          }

          const status: 'confirmed' | 'suspected' | 'recovered' =
            state.phase === 'RECOVERED'
              ? 'recovered'
              : state.phase === 'POST_FALL_MOTIONLESS'
              ? 'confirmed'
              : 'suspected';

          // Determine fall type
          let fallType: FallType = state.fallType;
          if (category === 'worker' && arMetrics.centroidDescentDistance > 80) {
            fallType = 'scaffold_drop';
          } else if (fallType === 'unknown') {
            if (poseMetrics.fallDirection !== 'unknown') {
              fallType = poseMetrics.fallDirection;
            } else if (arMetrics.aspectRatioVelocity > 1.2) {
              fallType = 'forward';
            } else {
              fallType = 'slump';
            }
          }

          results.push({
            detected: true,
            trackId: track.trackId,
            personCategory: category,
            fallType,
            confidence: Number(confidence.toFixed(3)),
            severity,
            status,
            impactSpeed: arMetrics.verticalVelocity,
            peakAspectRatio: arMetrics.peakAspectRatio,
            torsoAngleDegrees: poseMetrics.torsoAngleDegrees,
            motionlessDurationSeconds: state.motionlessDurationSeconds,
            recoveryDetected: state.recoveryDetected,
            recoveryTimeSeconds: state.recoveryTimeSeconds,
            boundingBox: latestObs.boundingBox,
            poseKeypoints: latestObs.keypoints,
            dynamicsTelemetry: {
              kinematics: {
                currentAspectRatio: arMetrics.currentAspectRatio,
                peakAspectRatio: arMetrics.peakAspectRatio,
                aspectRatioVelocity: arMetrics.aspectRatioVelocity,
                verticalVelocity: arMetrics.verticalVelocity,
                verticalAcceleration: arMetrics.verticalAcceleration,
                torsoAngleDegrees: poseMetrics.torsoAngleDegrees,
                headToHipDistance: poseMetrics.headToHipDistance,
                floorProximityScore: arMetrics.isHorizontallyOriented ? 0.95 : 0.40,
                motionEnergy: arMetrics.postImpactMotionEnergy,
              },
              stateHistory: state.history,
              isIntentionalSuppressed: false,
              suppressionReason: undefined,
            },
            alertRequired: shouldAlert,
          });
        }
      } else if (state.phase === 'SUPPRESSED_INTENTIONAL') {
        // Output suppressed event for diagnostics / verification
        results.push({
          detected: false,
          trackId: track.trackId,
          personCategory: category,
          fallType: 'unknown',
          confidence: 0.15,
          severity: 'P3',
          status: 'none',
          impactSpeed: arMetrics.verticalVelocity,
          peakAspectRatio: arMetrics.peakAspectRatio,
          torsoAngleDegrees: poseMetrics.torsoAngleDegrees,
          motionlessDurationSeconds: 0,
          recoveryDetected: false,
          recoveryTimeSeconds: null,
          boundingBox: latestObs.boundingBox,
          poseKeypoints: latestObs.keypoints,
          dynamicsTelemetry: {
            kinematics: {
              currentAspectRatio: arMetrics.currentAspectRatio,
              peakAspectRatio: arMetrics.peakAspectRatio,
              aspectRatioVelocity: arMetrics.aspectRatioVelocity,
              verticalVelocity: arMetrics.verticalVelocity,
              verticalAcceleration: arMetrics.verticalAcceleration,
              torsoAngleDegrees: poseMetrics.torsoAngleDegrees,
              headToHipDistance: poseMetrics.headToHipDistance,
              floorProximityScore: 0.20,
              motionEnergy: arMetrics.postImpactMotionEnergy,
            },
            stateHistory: state.history,
            isIntentionalSuppressed: true,
            suppressionReason: state.suppressionReason,
          },
          alertRequired: false,
        });
      }
    }

    // Clean up old stale tracks
    this.stateMachine.pruneStale(timestamp);

    return results;
  }

  /**
   * Compute composite confidence score in [0, 1]
   */
  private computeConfidence(
    ar: AspectRatioDynamicsAnalyzer['analyzeTrajectory'] extends (...args: any[]) => infer R ? R : any,
    pose: PoseKinematicsAnalyzer['analyzePose'] extends (...args: any[]) => infer R ? R : any,
    state: TrackFallState
  ): number {
    let score = 0;
    let weightSum = 0;

    // 1. Aspect Ratio Score (weight 0.35)
    // A wider bounding box on ground gives higher score
    const arRatio = Math.min(2.0, ar.peakAspectRatio / this.config.aspectRatioThreshold);
    const arScore = Math.min(1.0, arRatio * 0.7);
    score += arScore * 0.35;
    weightSum += 0.35;

    // 2. Pose Torso Score (weight 0.35)
    if (pose.hasValidPose && pose.torsoAngleDegrees !== null) {
      // The lower the angle, the closer to horizontal floor
      const torsoScore = Math.max(0, (90 - pose.torsoAngleDegrees) / 90);
      score += torsoScore * 0.35;
      weightSum += 0.35;
    } else {
      // If pose is unavailable, fall back to aspect ratio and velocity
      const fallbackScore = ar.isHorizontallyOriented ? 0.85 : 0.40;
      score += fallbackScore * 0.20;
      weightSum += 0.20;
    }

    // 3. Vertical Velocity & Acceleration Score (weight 0.20)
    const velRatio = Math.min(2.0, state.peakVelocityY / this.config.velocityThreshold);
    const velScore = Math.min(1.0, velRatio * 0.7);
    score += velScore * 0.20;
    weightSum += 0.20;

    // 4. Motionless Confirmation Score (weight 0.10)
    const motionlessScore = Math.min(1.0, state.motionlessDurationSeconds / this.config.motionlessDelaySeconds);
    score += motionlessScore * 0.10;
    weightSum += 0.10;

    // Sensitivity factor adjustment
    const rawConfidence = weightSum > 0 ? score / weightSum : 0.5;
    const adjustedConfidence = rawConfidence * (0.5 + this.config.sensitivity * 0.5);

    return Math.min(0.99, Math.max(0.10, adjustedConfidence));
  }

  public resetAlertForTrack(trackId: string): void {
    this.alertedTracks.delete(trackId);
  }
}
