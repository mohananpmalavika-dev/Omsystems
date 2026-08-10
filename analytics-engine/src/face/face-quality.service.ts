/**
 * Face Quality Assessment Service
 * Evaluates face quality before embedding extraction or enrollment
 */

import type { 
  FaceDetection, 
  FaceQualityResult, 
  FaceQualityRejectionReason,
  BoundingBox 
} from './face.types.js';

export interface FaceQualityConfig {
  minimumFaceSize: number;
  minimumDetectionConfidence: number;
  maximumYaw: number;
  maximumPitch: number;
  maximumRoll: number;
  minimumBrightness: number;
  maximumBrightness: number;
  maximumBlur: number;
  enrollmentThreshold: number;
  runtimeThreshold: number;
}

export class FaceQualityService {
  private config: FaceQualityConfig;

  constructor(config?: Partial<FaceQualityConfig>) {
    this.config = {
      minimumFaceSize: 80,
      minimumDetectionConfidence: 0.85,
      maximumYaw: 35,
      maximumPitch: 25,
      maximumRoll: 30,
      minimumBrightness: 40,
      maximumBrightness: 220,
      maximumBlur: 100,
      enrollmentThreshold: 0.80,
      runtimeThreshold: 0.55,
      ...config,
    };
  }

  /**
   * Evaluate face quality for enrollment (strict)
   */
  evaluateForEnrollment(
    detection: FaceDetection,
    frameWidth: number,
    frameHeight: number,
    imageData?: Buffer,
  ): FaceQualityResult {
    return this.evaluate(
      detection,
      frameWidth,
      frameHeight,
      this.config.enrollmentThreshold,
      imageData,
    );
  }

  /**
   * Evaluate face quality for runtime recognition (lenient)
   */
  evaluateForRecognition(
    detection: FaceDetection,
    frameWidth: number,
    frameHeight: number,
    imageData?: Buffer,
  ): FaceQualityResult {
    return this.evaluate(
      detection,
      frameWidth,
      frameHeight,
      this.config.runtimeThreshold,
      imageData,
    );
  }

  /**
   * Core evaluation logic
   */
  private evaluate(
    detection: FaceDetection,
    frameWidth: number,
    frameHeight: number,
    qualityThreshold: number,
    imageData?: Buffer,
  ): FaceQualityResult {
    const reasons: FaceQualityRejectionReason[] = [];
    const metrics: FaceQualityResult['metrics'] = {
      size: 0,
    };

    // Check detection confidence
    if (detection.confidence < this.config.minimumDetectionConfidence) {
      reasons.push('LOW_DETECTION_CONFIDENCE');
    }

    // Check face size
    const bbox = detection.boundingBox;
    const faceWidth = bbox.width * frameWidth;
    const faceHeight = bbox.height * frameHeight;
    metrics.size = Math.min(faceWidth, faceHeight);

    if (faceWidth < this.config.minimumFaceSize || faceHeight < this.config.minimumFaceSize) {
      reasons.push('TOO_SMALL');
    }

    // Check bounding box is within frame
    if (!this.isBboxValid(bbox)) {
      reasons.push('OUT_OF_BOUNDS');
    }

    // Check landmarks presence
    if (!this.areLandmarksValid(detection.landmarks)) {
      reasons.push('LANDMARKS_MISSING');
    }

    // Estimate pose from landmarks
    const pose = this.estimatePose(detection.landmarks);
    metrics.yaw = pose.yaw;
    metrics.pitch = pose.pitch;
    metrics.roll = pose.roll;

    if (Math.abs(pose.yaw) > this.config.maximumYaw) {
      reasons.push('POSE_TOO_EXTREME');
    }
    if (Math.abs(pose.pitch) > this.config.maximumPitch) {
      reasons.push('POSE_TOO_EXTREME');
    }
    if (Math.abs(pose.roll) > this.config.maximumRoll) {
      reasons.push('POSE_TOO_EXTREME');
    }

    // Image-based quality checks (if image data provided)
    if (imageData) {
      const imageQuality = this.analyzeImageQuality(
        imageData,
        bbox,
        frameWidth,
        frameHeight,
      );

      metrics.blur = imageQuality.blur;
      metrics.brightness = imageQuality.brightness;

      if (imageQuality.blur > this.config.maximumBlur) {
        reasons.push('TOO_BLURRY');
      }

      if (imageQuality.brightness < this.config.minimumBrightness) {
        reasons.push('UNDEREXPOSED');
      }

      if (imageQuality.brightness > this.config.maximumBrightness) {
        reasons.push('OVEREXPOSED');
      }

      if (imageQuality.occlusion > 0.3) {
        reasons.push('FACE_OCCLUDED');
      }
    }

    // Calculate overall quality score
    const score = this.calculateQualityScore(metrics, reasons, detection.confidence);

    return {
      acceptable: reasons.length === 0 && score >= qualityThreshold,
      score,
      reasons,
      metrics,
    };
  }

  /**
   * Estimate face pose from landmarks
   */
  private estimatePose(landmarks: FaceDetection['landmarks']): {
    yaw: number;
    pitch: number;
    roll: number;
  } {
    const { leftEye, rightEye, nose, leftMouth, rightMouth } = landmarks;

    // Calculate eye center and width
    const eyeCenterX = (leftEye.x + rightEye.x) / 2;
    const eyeCenterY = (leftEye.y + rightEye.y) / 2;
    const eyeWidth = Math.abs(rightEye.x - leftEye.x);

    // Calculate mouth center and width
    const mouthCenterX = (leftMouth.x + rightMouth.x) / 2;
    const mouthCenterY = (leftMouth.y + rightMouth.y) / 2;
    const mouthWidth = Math.abs(rightMouth.x - leftMouth.x);

    // Estimate yaw (left-right rotation)
    // Nose should be centered between eyes for frontal face
    const noseToCenterX = nose.x - eyeCenterX;
    const yaw = (noseToCenterX / eyeWidth) * 90; // Approximate in degrees

    // Estimate pitch (up-down rotation)
    // Nose-to-mouth distance changes with pitch
    const noseToMouthY = mouthCenterY - nose.y;
    const eyeToMouthY = mouthCenterY - eyeCenterY;
    const pitchRatio = noseToMouthY / (eyeToMouthY || 1);
    const pitch = (1 - pitchRatio) * 45; // Approximate in degrees

    // Estimate roll (head tilt)
    // Eye line should be horizontal
    const eyeAngle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
    const roll = (eyeAngle * 180) / Math.PI;

    return {
      yaw: Math.max(-90, Math.min(90, yaw)),
      pitch: Math.max(-90, Math.min(90, pitch)),
      roll: Math.max(-90, Math.min(90, roll)),
    };
  }

  /**
   * Analyze image quality metrics
   */
  private analyzeImageQuality(
    imageData: Buffer,
    bbox: BoundingBox,
    frameWidth: number,
    frameHeight: number,
  ): {
    blur: number;
    brightness: number;
    occlusion: number;
  } {
    // Placeholder implementation
    // In production, this would analyze the actual image crop
    // using techniques like:
    // - Laplacian variance for blur detection
    // - Histogram analysis for brightness
    // - Edge detection for occlusion estimation

    return {
      blur: 0, // Lower is better
      brightness: 128, // 0-255
      occlusion: 0, // 0-1
    };
  }

  /**
   * Calculate composite quality score
   */
  private calculateQualityScore(
    metrics: FaceQualityResult['metrics'],
    reasons: FaceQualityRejectionReason[],
    detectionConfidence: number,
  ): number {
    if (reasons.length > 0) {
      // Penalize based on number and severity of issues
      const severityPenalty = reasons.length * 0.15;
      return Math.max(0, detectionConfidence - severityPenalty);
    }

    // Base score on detection confidence
    let score = detectionConfidence;

    // Bonus for good pose
    if (metrics.yaw !== undefined && metrics.pitch !== undefined) {
      const maxPoseDeviation = Math.max(
        Math.abs(metrics.yaw),
        Math.abs(metrics.pitch),
        Math.abs(metrics.roll || 0),
      );
      const poseQuality = 1 - maxPoseDeviation / 45;
      score = score * 0.7 + poseQuality * 0.3;
    }

    // Bonus for good size
    if (metrics.size > this.config.minimumFaceSize * 1.5) {
      score = Math.min(1, score * 1.05);
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Validate bounding box
   */
  private isBboxValid(bbox: BoundingBox): boolean {
    return (
      bbox.x >= 0 &&
      bbox.y >= 0 &&
      bbox.x + bbox.width <= 1 &&
      bbox.y + bbox.height <= 1 &&
      bbox.width > 0 &&
      bbox.height > 0
    );
  }

  /**
   * Validate landmarks
   */
  private areLandmarksValid(landmarks: FaceDetection['landmarks']): boolean {
    const points = [
      landmarks.leftEye,
      landmarks.rightEye,
      landmarks.nose,
      landmarks.leftMouth,
      landmarks.rightMouth,
    ];

    return points.every(
      (point) =>
        point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1,
    );
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FaceQualityConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): FaceQualityConfig {
    return { ...this.config };
  }
}
