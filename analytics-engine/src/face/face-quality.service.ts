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

      if (imageQuality.occlusion !== undefined && imageQuality.occlusion > 0.3) {
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
    occlusion?: number;
  } {
    if (imageData.length < frameWidth * frameHeight * 4) {
      return { blur: Number.POSITIVE_INFINITY, brightness: 0 };
    }

    const left = Math.max(0, Math.floor(bbox.x * frameWidth));
    const top = Math.max(0, Math.floor(bbox.y * frameHeight));
    const right = Math.min(frameWidth, Math.ceil((bbox.x + bbox.width) * frameWidth));
    const bottom = Math.min(frameHeight, Math.ceil((bbox.y + bbox.height) * frameHeight));
    const grayscale = (x: number, y: number) => {
      const offset = (y * frameWidth + x) * 4;
      return 0.2126 * imageData[offset]! + 0.7152 * imageData[offset + 1]! + 0.0722 * imageData[offset + 2]!;
    };

    let count = 0;
    let sum = 0;
    let sumSquares = 0;
    let laplacianSum = 0;
    let laplacianSquares = 0;
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const value = grayscale(x, y);
        sum += value;
        sumSquares += value * value;
        count += 1;
        if (x > left && x < right - 1 && y > top && y < bottom - 1) {
          const laplacian = grayscale(x - 1, y) + grayscale(x + 1, y) + grayscale(x, y - 1) + grayscale(x, y + 1) - 4 * value;
          laplacianSum += laplacian;
          laplacianSquares += laplacian * laplacian;
        }
      }
    }
    if (count === 0) return { blur: Number.POSITIVE_INFINITY, brightness: 0 };
    const mean = sum / count;
    const laplacianCount = Math.max(1, (right - left - 2) * (bottom - top - 2));
    const laplacianMean = laplacianSum / laplacianCount;
    const blur = Math.max(0, laplacianSquares / laplacianCount - laplacianMean * laplacianMean);
    return {
      blur,
      brightness: mean,
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
