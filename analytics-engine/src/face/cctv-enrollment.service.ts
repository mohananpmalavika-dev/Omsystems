/**
 * CCTV Video Enrollment Service
 * 
 * Enables enrolling employees directly from CCTV footage.
 * Use cases:
 * - Enroll employee from existing surveillance footage
 * - Auto-capture during orientation/onboarding at camera
 * - Retrospective enrollment from video archives
 * 
 * ഉപയോഗം:
 * 1. CCTV വീഡിയോയിൽ employee കാണുമ്പോൾ
 * 2. ആ face-നെ select ചെയ്യുക
 * 3. Quality ചെക്ക് ചെയ്ത് auto-enroll ചെയ്യും
 */

import type { Pool } from 'pg';
import type { FaceRecognitionService } from './face-recognition.service.js';
import type { FaceEnrollmentService } from './face-enrollment.service.js';
import type { FaceDetection } from './face.types.js';

export interface CCTVEnrollmentInput {
  tenantId: string;
  watchlistId: string;
  employeeName: string;
  employeeId?: string;
  
  // From CCTV
  cameraId: string;
  videoTimestamp: Date;
  frameBuffer: Buffer; // Full frame image
  frameWidth: number;
  frameHeight: number;
  
  // Face location in frame
  faceBoundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  
  // Optional
  metadata?: Record<string, unknown>;
  actorId: string; // Who initiated enrollment
}

export interface CCTVEnrollmentValidation {
  suitable: boolean;
  quality: number;
  reasons: string[];
  recommendations?: string[];
}

export interface CCTVEnrollmentResult {
  success: boolean;
  personId?: string;
  embeddingId?: string;
  quality?: number;
  error?: string;
  validation: CCTVEnrollmentValidation;
  capturedImage?: Buffer; // Cropped face
}

/**
 * Minimum quality thresholds for CCTV enrollment
 * (Slightly lower than photo enrollment due to video quality)
 */
const CCTV_ENROLLMENT_THRESHOLDS = {
  minQuality: 0.65,        // Lower than photo (0.80) but still good
  minFaceSize: 80,         // pixels
  maxYaw: 30,              // degrees
  maxPitch: 25,            // degrees
  maxRoll: 25,             // degrees
  minSharpness: 0.50,      // Blur detection
  minBrightness: 30,       // Too dark
  maxBrightness: 220,      // Overexposed
};

export class CCTVEnrollmentService {
  constructor(
    private readonly db: Pool,
    private readonly recognitionService: FaceRecognitionService,
    private readonly enrollmentService: FaceEnrollmentService,
  ) {}

  /**
   * Validate if CCTV frame is suitable for enrollment
   */
  async validateCCTVFrame(
    frameBuffer: Buffer,
    frameWidth: number,
    frameHeight: number,
    faceBoundingBox: { x: number; y: number; width: number; height: number },
  ): Promise<CCTVEnrollmentValidation> {
    const reasons: string[] = [];
    const recommendations: string[] = [];

    try {
      // Extract face region
      const faceImage = await this.extractFaceRegion(
        frameBuffer,
        frameWidth,
        frameHeight,
        faceBoundingBox,
      );

      // Check face size
      const faceWidth = faceBoundingBox.width;
      const faceHeight = faceBoundingBox.height;
      const faceSize = Math.min(faceWidth, faceHeight);

      if (faceSize < CCTV_ENROLLMENT_THRESHOLDS.minFaceSize) {
        reasons.push(
          `Face too small (${Math.round(faceSize)}px). ` +
          `Minimum ${CCTV_ENROLLMENT_THRESHOLDS.minFaceSize}px required.`
        );
        recommendations.push('Camera-യോട് കൂടുതൽ അടുത്ത് നിൽക്കുക അല്ലെങ്കിൽ zoom ഉപയോഗിക്കുക');
      }

      // Detect face and get quality metrics
      const services = (this.recognitionService as any).getServices();
      const qualityService = services?.quality;

      if (!qualityService) {
        reasons.push('Quality service not available');
        return {
          suitable: false,
          quality: 0,
          reasons,
          recommendations,
        };
      }

      // Create mock detection for quality check
      const detection: FaceDetection = {
        bbox: faceBoundingBox,
        confidence: 0.9,
        landmarks: undefined, // Will be detected
        quality: 0, // Will be calculated
      };

      const quality = qualityService.evaluateForEnrollment(
        detection,
        frameWidth,
        frameHeight,
        faceImage,
      );

      // Check overall quality
      if (quality.overallScore < CCTV_ENROLLMENT_THRESHOLDS.minQuality) {
        reasons.push(
          `Face quality too low (${(quality.overallScore * 100).toFixed(1)}%). ` +
          `Minimum ${(CCTV_ENROLLMENT_THRESHOLDS.minQuality * 100).toFixed(0)}% required.`
        );
      }

      // Check pose
      if (quality.pose) {
        if (Math.abs(quality.pose.yaw) > CCTV_ENROLLMENT_THRESHOLDS.maxYaw) {
          reasons.push(`Head turned too much sideways (${Math.round(quality.pose.yaw)}°)`);
          recommendations.push('മുഖം നേരെ camera-യ്ക്ക് നോക്കുക');
        }
        if (Math.abs(quality.pose.pitch) > CCTV_ENROLLMENT_THRESHOLDS.maxPitch) {
          reasons.push(`Head tilted too much up/down (${Math.round(quality.pose.pitch)}°)`);
          recommendations.push('തല നേരെ വയ്ക്കുക (മുകളിലേക്കോ താഴേക്കോ കുനിയാതെ)');
        }
      }

      // Check sharpness (blur)
      if (quality.sharpness && quality.sharpness < CCTV_ENROLLMENT_THRESHOLDS.minSharpness) {
        reasons.push('Image too blurry');
        recommendations.push('വ്യക്തമായ ഫ്രെയിം തിരഞ്ഞെടുക്കുക (നീങ്ങുന്ന സമയത്തല്ല)');
      }

      // Check brightness
      if (quality.brightness) {
        if (quality.brightness < CCTV_ENROLLMENT_THRESHOLDS.minBrightness) {
          reasons.push('Image too dark');
          recommendations.push('കൂടുതൽ വെളിച്ചമുള്ള സമയത്തെ video തിരഞ്ഞെടുക്കുക');
        }
        if (quality.brightness > CCTV_ENROLLMENT_THRESHOLDS.maxBrightness) {
          reasons.push('Image overexposed (too bright)');
          recommendations.push('Exposure കുറവായ സമയത്തെ video തിരഞ്ഞെടുക്കുക');
        }
      }

      // Check for occlusions
      if (quality.occluded) {
        reasons.push('Face partially covered (mask, sunglasses, etc.)');
        recommendations.push('മുഖം പൂർണ്ണമായി കാണുന്ന ഫ്രെയിം തിരഞ്ഞെടുക്കുക');
      }

      const suitable = reasons.length === 0;

      return {
        suitable,
        quality: quality.overallScore,
        reasons: reasons.length > 0 ? reasons : ['Frame suitable for enrollment'],
        recommendations,
      };
    } catch (error) {
      reasons.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        suitable: false,
        quality: 0,
        reasons,
        recommendations,
      };
    }
  }

  /**
   * Enroll employee from CCTV footage
   */
  async enrollFromCCTV(input: CCTVEnrollmentInput): Promise<CCTVEnrollmentResult> {
    try {
      // Step 1: Validate frame quality
      const validation = await this.validateCCTVFrame(
        input.frameBuffer,
        input.frameWidth,
        input.frameHeight,
        input.faceBoundingBox,
      );

      if (!validation.suitable) {
        return {
          success: false,
          error: validation.reasons.join('; '),
          validation,
        };
      }

      // Step 2: Extract and prepare face image
      const faceImage = await this.extractFaceRegion(
        input.frameBuffer,
        input.frameWidth,
        input.frameHeight,
        input.faceBoundingBox,
      );

      // Step 3: Check for duplicates
      const duplicateCheck = await this.checkForDuplicates(
        input.tenantId,
        input.watchlistId,
        faceImage,
      );

      if (duplicateCheck.isDuplicate) {
        return {
          success: false,
          error: `Employee already enrolled: ${duplicateCheck.existingName} ` +
                 `(similarity: ${(duplicateCheck.similarity! * 100).toFixed(1)}%)`,
          validation,
        };
      }

      // Step 4: Enroll using standard enrollment service
      const enrollmentResult = await this.enrollmentService.enrollPerson({
        tenantId: input.tenantId,
        watchlistId: input.watchlistId,
        displayName: input.employeeName,
        externalId: input.employeeId,
        images: [faceImage],
        metadata: {
          ...input.metadata,
          enrollmentSource: 'cctv',
          cameraId: input.cameraId,
          videoTimestamp: input.videoTimestamp.toISOString(),
          captureMethod: 'manual_selection',
        },
        actorId: input.actorId,
      });

      if (!enrollmentResult.success) {
        return {
          success: false,
          error: enrollmentResult.failures?.[0]?.reason || 'Enrollment failed',
          validation,
        };
      }

      // Step 5: Log CCTV enrollment event
      await this.logEnrollmentEvent(input, enrollmentResult.personId!, validation.quality!);

      return {
        success: true,
        personId: enrollmentResult.personId,
        embeddingId: enrollmentResult.embeddingIds?.[0],
        quality: validation.quality,
        validation,
        capturedImage: faceImage,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        validation: {
          suitable: false,
          quality: 0,
          reasons: [error instanceof Error ? error.message : 'Unknown error'],
        },
      };
    }
  }

  /**
   * Batch enroll multiple employees from CCTV
   * (E.g., from orientation video where multiple people appear)
   */
  async batchEnrollFromCCTV(
    inputs: CCTVEnrollmentInput[],
  ): Promise<CCTVEnrollmentResult[]> {
    const results: CCTVEnrollmentResult[] = [];

    for (const input of inputs) {
      const result = await this.enrollFromCCTV(input);
      results.push(result);
    }

    return results;
  }

  /**
   * Auto-collect enrollment samples from live CCTV
   * Employee stands in front of camera for N seconds,
   * system auto-captures best frames
   */
  async autoCollectFromLiveCamera(
    tenantId: string,
    watchlistId: string,
    cameraId: string,
    employeeName: string,
    employeeId: string,
    durationSeconds: number = 10,
    targetFrames: number = 5,
  ): Promise<{
    success: boolean;
    collected: number;
    enrolled: boolean;
    personId?: string;
    error?: string;
  }> {
    // This would integrate with live camera stream
    // For now, return placeholder
    return {
      success: false,
      collected: 0,
      enrolled: false,
      error: 'Live camera integration not yet implemented. Use manual frame selection.',
    };
  }

  /**
   * Extract face region from full frame
   */
  private async extractFaceRegion(
    frameBuffer: Buffer,
    frameWidth: number,
    frameHeight: number,
    bbox: { x: number; y: number; width: number; height: number },
  ): Promise<Buffer> {
    const sharp = (await import('sharp')).default;

    // Add padding around face (20% on each side)
    const padding = 0.2;
    const paddedX = Math.max(0, bbox.x - bbox.width * padding);
    const paddedY = Math.max(0, bbox.y - bbox.height * padding);
    const paddedWidth = Math.min(
      frameWidth - paddedX,
      bbox.width * (1 + 2 * padding)
    );
    const paddedHeight = Math.min(
      frameHeight - paddedY,
      bbox.height * (1 + 2 * padding)
    );

    return sharp(frameBuffer)
      .extract({
        left: Math.round(paddedX),
        top: Math.round(paddedY),
        width: Math.round(paddedWidth),
        height: Math.round(paddedHeight),
      })
      .resize(512, 512, { fit: 'cover' }) // Standardize size
      .jpeg({ quality: 95 })
      .toBuffer();
  }

  /**
   * Check if face already enrolled
   */
  private async checkForDuplicates(
    tenantId: string,
    watchlistId: string,
    faceImage: Buffer,
  ): Promise<{
    isDuplicate: boolean;
    existingName?: string;
    existingId?: string;
    similarity?: number;
  }> {
    // Generate embedding for the face
    const services = (this.recognitionService as any).getServices();
    const embeddingService = services?.embedding;

    if (!embeddingService) {
      return { isDuplicate: false };
    }

    try {
      const embedding = await embeddingService.generateEmbedding(faceImage);
      
      // Search for similar faces
      const searchService = services.search;
      const results = await searchService.search({
        tenantId,
        embedding,
        watchlistIds: [watchlistId],
        limit: 1,
        threshold: 0.85, // 85% similarity = likely duplicate
      });

      if (results.length > 0 && results[0].similarity >= 0.85) {
        return {
          isDuplicate: true,
          existingName: results[0].displayName,
          existingId: results[0].personId,
          similarity: results[0].similarity,
        };
      }

      return { isDuplicate: false };
    } catch (error) {
      console.error('Duplicate check failed:', error);
      return { isDuplicate: false };
    }
  }

  /**
   * Log enrollment event to audit trail
   */
  private async logEnrollmentEvent(
    input: CCTVEnrollmentInput,
    personId: string,
    quality: number,
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, details, timestamp)
         VALUES ($1, $2, 'cctv_enrollment', $3, NOW())`,
        [
          input.tenantId,
          input.actorId,
          JSON.stringify({
            personId,
            personName: input.employeeName,
            employeeId: input.employeeId,
            cameraId: input.cameraId,
            videoTimestamp: input.videoTimestamp,
            quality: Math.round(quality * 100),
            watchlistId: input.watchlistId,
          }),
        ]
      );
    } catch (error) {
      console.error('Failed to log enrollment event:', error);
    }
  }
}
