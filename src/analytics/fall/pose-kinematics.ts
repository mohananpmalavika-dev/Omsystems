/**
 * Human Pose Estimation Kinematics Analyzer
 * 
 * Computes torso inclination angles, head-to-hip vertical projection compression,
 * limb joint kinematics, ground plane alignment, and directional fall classification.
 */

import type { Keypoint, PoseKeypoints, FallType } from './types.js';

export interface PoseKinematicsMetrics {
  hasValidPose: boolean;
  torsoAngleDegrees: number | null; // 90 = upright, 0 = prone horizontal
  isTorsoHorizontal: boolean;
  headToHipDistance: number | null;
  verticalSpanRatio: number | null; // ratio of vertical keypoint span to body length
  fallDirection: FallType;
  averageKeypointConfidence: number;
  kneeBucklingDetected: boolean;
  elevationDropRatio: number;
}

export class PoseKinematicsAnalyzer {
  private readonly torsoAngleThreshold: number; // e.g. 35 degrees

  constructor(options?: { torsoAngleThreshold?: number }) {
    this.torsoAngleThreshold = options?.torsoAngleThreshold ?? 35.0;
  }

  /**
   * Analyze instantaneous keypoints of a person
   */
  public analyzePose(keypoints?: PoseKeypoints): PoseKinematicsMetrics {
    if (!keypoints || Object.keys(keypoints).length === 0) {
      return {
        hasValidPose: false,
        torsoAngleDegrees: null,
        isTorsoHorizontal: false,
        headToHipDistance: null,
        verticalSpanRatio: null,
        fallDirection: 'unknown',
        averageKeypointConfidence: 0,
        kneeBucklingDetected: false,
        elevationDropRatio: 0,
      };
    }

    // Extract keypoints
    const nose = keypoints.nose;
    const leftShoulder = keypoints.leftShoulder;
    const rightShoulder = keypoints.rightShoulder;
    const leftHip = keypoints.leftHip;
    const rightHip = keypoints.rightHip;
    const leftKnee = keypoints.leftKnee;
    const rightKnee = keypoints.rightKnee;
    const leftAnkle = keypoints.leftAnkle;
    const rightAnkle = keypoints.rightAnkle;
    const spine = keypoints.spine;
    const pelvis = keypoints.pelvis;

    // Calculate average confidence of available keypoints
    const kpList = Object.values(keypoints).filter((kp): kp is Keypoint => !!kp && typeof kp.confidence === 'number');
    const avgConfidence = kpList.length > 0
      ? kpList.reduce((acc, kp) => acc + kp.confidence, 0) / kpList.length
      : 0;

    // Determine shoulder and hip centers
    const shoulderCenter = this.midpoint(leftShoulder, rightShoulder) || leftShoulder || rightShoulder;
    const hipCenter = pelvis || this.midpoint(leftHip, rightHip) || leftHip || rightHip;

    // Torso angle calculation
    let torsoAngleDegrees: number | null = null;
    let isTorsoHorizontal = false;

    if (shoulderCenter && hipCenter) {
      const dx = Math.abs(shoulderCenter.x - hipCenter.x);
      const dy = Math.abs(shoulderCenter.y - hipCenter.y); // in screen coords, y increases downwards

      // Angle relative to the horizontal ground plane (0 = horizontal, 90 = vertical)
      const rad = Math.atan2(dy, dx);
      torsoAngleDegrees = Number(((rad * 180) / Math.PI).toFixed(1));
      isTorsoHorizontal = torsoAngleDegrees < this.torsoAngleThreshold;
    } else if (spine && nose) {
      // Fallback using nose and spine
      const dx = Math.abs(nose.x - spine.x);
      const dy = Math.abs(nose.y - spine.y);
      const rad = Math.atan2(dy, dx);
      torsoAngleDegrees = Number(((rad * 180) / Math.PI).toFixed(1));
      isTorsoHorizontal = torsoAngleDegrees < this.torsoAngleThreshold;
    }

    // Head to hip vertical distance
    let headToHipDist: number | null = null;
    const head = nose || keypoints.leftEye || keypoints.rightEye;
    if (head && hipCenter) {
      headToHipDist = Number(Math.abs(head.y - hipCenter.y).toFixed(2));
    }

    // Vertical span ratio (topmost keypoint to bottommost keypoint)
    let verticalSpanRatio: number | null = null;
    if (kpList.length >= 4) {
      const ys = kpList.map((k) => k.y);
      const xs = kpList.map((k) => k.x);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const spanY = Math.max(0.01, maxY - minY);
      const spanX = Math.max(0.01, maxX - minX);
      verticalSpanRatio = Number((spanY / (spanX + spanY)).toFixed(3));
    }

    // Knee buckling detection (knees drop to ankle level while hips drop)
    let kneeBucklingDetected = false;
    const kneeCenter = this.midpoint(leftKnee, rightKnee) || leftKnee || rightKnee;
    const ankleCenter = this.midpoint(leftAnkle, rightAnkle) || leftAnkle || rightAnkle;
    if (kneeCenter && ankleCenter && hipCenter) {
      const kneeToAnkleDist = Math.abs(kneeCenter.y - ankleCenter.y);
      const hipToKneeDist = Math.abs(hipCenter.y - kneeCenter.y);
      // If knees are compressed very close to ankles and hips are compressed to knees
      if (kneeToAnkleDist < 25 && hipToKneeDist < 30) {
        kneeBucklingDetected = true;
      }
    }

    // Direction classification
    const fallDirection = this.classifyDirection(
      shoulderCenter || null,
      hipCenter || null,
      kneeCenter || null,
      head || null,
      torsoAngleDegrees
    );

    return {
      hasValidPose: kpList.length >= 3 && avgConfidence >= 0.40,
      torsoAngleDegrees,
      isTorsoHorizontal,
      headToHipDistance: headToHipDist,
      verticalSpanRatio,
      fallDirection,
      averageKeypointConfidence: Number(avgConfidence.toFixed(3)),
      kneeBucklingDetected,
      elevationDropRatio: isTorsoHorizontal ? 0.85 : 0.15,
    };
  }

  private midpoint(p1?: Keypoint, p2?: Keypoint): Keypoint | null {
    if (!p1 && !p2) return null;
    if (p1 && !p2) return p1;
    if (!p1 && p2) return p2;
    return {
      x: (p1!.x + p2!.x) / 2,
      y: (p1!.y + p2!.y) / 2,
      confidence: Math.min(p1!.confidence, p2!.confidence),
    };
  }

  private classifyDirection(
    shoulders: Keypoint | null,
    hips: Keypoint | null,
    knees: Keypoint | null,
    head: Keypoint | null,
    torsoAngle: number | null
  ): FallType {
    if (torsoAngle === null || torsoAngle > 45) {
      return 'unknown';
    }

    if (!shoulders || !hips) {
      return 'unknown';
    }

    // Check knee buckling first for slump
    if (knees && Math.abs(hips.y - knees.y) < 25 && Math.abs(shoulders.y - hips.y) < 30) {
      return 'slump';
    }

    // If head/nose is available, determine forward vs backward
    if (head) {
      if (head.y >= hips.y - 10) {
        return 'forward';
      } else {
        return 'backward';
      }
    }

    const dx = shoulders.x - hips.x;
    const dy = shoulders.y - hips.y;

    // Check lateral tilt in screen coordinates
    if (Math.abs(dx) > Math.abs(dy) * 1.2) {
      return 'sideways';
    }

    return 'unknown';
  }
}
