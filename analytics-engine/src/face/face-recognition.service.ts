/**
 * Face Recognition Service
 * Orchestrates the complete face recognition pipeline
 */

import type { Pool } from 'pg';
import { FaceQualityService } from './face-quality.service.js';
import { FaceAlignmentService } from './face-alignment.service.js';
import { FaceEmbeddingService } from './face-embedding.service.js';
import { FaceSearchService } from './face-search.service.js';
import { FaceDecisionPolicy } from './face-decision-policy.ts.js';
import type {
  FaceDetection,
  FaceObservation,
  RecognitionDecision,
  FaceRecognitionConfig,
  WatchlistThresholdConfig,
} from './face.types.js';

export class FaceRecognitionService {
  private qualityService: FaceQualityService;
  private alignmentService: FaceAlignmentService;
  private embeddingService: FaceEmbeddingService;
  private searchService: FaceSearchService;
  private decisionPolicy: FaceDecisionPolicy;
  private config: FaceRecognitionConfig;
  private isInitialized = false;

  constructor(
    db: Pool,
    config?: Partial<FaceRecognitionConfig>,
  ) {
    this.config = {
      modelName: 'arcface-r100',
      modelVersion: '1.0.0',
      embeddingDimension: 512,
      enrollmentQualityThreshold: 0.80,
      runtimeQualityThreshold: 0.55,
      minimumFaceSize: 80,
      maximumPoseYaw: 35,
      maximumPosePitch: 25,
      maximumPoseRoll: 30,
      searchLimit: 10,
      retainEnrollmentImages: false,
      ...config,
    };

    // Initialize services
    this.qualityService = new FaceQualityService({
      minimumFaceSize: this.config.minimumFaceSize,
      maximumYaw: this.config.maximumPoseYaw,
      maximumPitch: this.config.maximumPosePitch,
      maximumRoll: this.config.maximumPoseRoll,
      enrollmentThreshold: this.config.enrollmentQualityThreshold,
      runtimeThreshold: this.config.runtimeQualityThreshold,
    });

    this.alignmentService = new FaceAlignmentService({
      outputSize: 112,
      landmarks5Points: true,
    });

    this.embeddingService = new FaceEmbeddingService({
      modelName: this.config.modelName,
      modelVersion: this.config.modelVersion,
      embeddingDimension: this.config.embeddingDimension,
    });

    this.searchService = new FaceSearchService(db, {
      searchLimit: this.config.searchLimit,
    });

    this.decisionPolicy = new FaceDecisionPolicy();
  }

  /**
   * Initialize all services
   */
  async initialize(): Promise<void> {
    try {
      await this.embeddingService.initialize();
      this.isInitialized = true;
      console.log('Face Recognition Service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Face Recognition Service:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * Recognize faces in a frame (main entry point)
   */
  async recognizeFrame(
    tenantId: string,
    frameId: string,
    cameraId: string,
    timestamp: Date,
    frameData: Buffer,
    frameWidth: number,
    frameHeight: number,
    detections: FaceDetection[],
    watchlistIds?: string[],
  ): Promise<FaceObservation[]> {
    if (!this.isInitialized) {
      throw new Error('FaceRecognitionService not initialized');
    }

    const observations: FaceObservation[] = [];

    for (const detection of detections) {
      const observation = await this.recognizeFace(
        tenantId,
        frameId,
        cameraId,
        timestamp,
        frameData,
        frameWidth,
        frameHeight,
        detection,
        watchlistIds,
      );

      observations.push(observation);
    }

    return observations;
  }

  /**
   * Recognize a single face
   */
  async recognizeFace(
    tenantId: string,
    frameId: string,
    cameraId: string,
    timestamp: Date,
    frameData: Buffer,
    frameWidth: number,
    frameHeight: number,
    detection: FaceDetection,
    watchlistIds?: string[],
  ): Promise<FaceObservation> {
    const faceId = `face_${timestamp.getTime()}_${Math.random().toString(36).substring(7)}`;

    // Step 1: Quality assessment
    const quality = this.qualityService.evaluateForRecognition(
      detection,
      frameWidth,
      frameHeight,
      frameData,
    );

    const observation: FaceObservation = {
      faceId,
      frameId,
      cameraId,
      timestamp,
      bbox: detection.boundingBox,
      landmarks: detection.landmarks,
      detectionConfidence: detection.confidence,
      quality,
      trackId: detection.trackId,
    };

    // If quality is unacceptable, return early
    if (!quality.acceptable) {
      observation.recognition = {
        status: 'FACE_TOO_LOW_QUALITY',
        qualityScore: quality.score,
        reasons: quality.reasons,
      };
      return observation;
    }

    try {
      // Step 2: Face alignment
      const alignedFace = await this.alignmentService.align(
        frameData,
        detection,
        frameWidth,
        frameHeight,
      );

      // Step 3: Extract embedding
      const embedding = await this.embeddingService.extractEmbedding(
        alignedFace,
        quality.score,
        {
          yaw: quality.metrics.yaw,
          pitch: quality.metrics.pitch,
          roll: quality.metrics.roll,
        },
      );

      observation.embedding = embedding;

      // Step 4: Search for matches
      const candidates = await this.searchService.searchPersons({
        tenantId,
        embedding: embedding.vector,
        watchlistIds,
        limit: this.config.searchLimit,
      });

      // Step 5: Make decision
      const decision = this.decisionPolicy.evaluate(candidates, quality);
      observation.recognition = decision;

      return observation;
    } catch (error) {
      console.error('Face recognition pipeline error:', error);

      // Return graceful failure
      observation.recognition = {
        status: 'MODEL_UNAVAILABLE',
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      return observation;
    }
  }

  /**
   * Process face for enrollment (stricter quality requirements)
   */
  async processFaceForEnrollment(
    imageData: Buffer,
    imageWidth: number,
    imageHeight: number,
    detection: FaceDetection,
  ): Promise<{
    success: boolean;
    embedding?: Float32Array;
    quality?: number;
    error?: string;
  }> {
    try {
      // Strict quality check for enrollment
      const quality = this.qualityService.evaluateForEnrollment(
        detection,
        imageWidth,
        imageHeight,
        imageData,
      );

      if (!quality.acceptable) {
        return {
          success: false,
          error: `Face quality insufficient: ${quality.reasons.join(', ')}`,
        };
      }

      // Align face
      const alignedFace = await this.alignmentService.align(
        imageData,
        detection,
        imageWidth,
        imageHeight,
      );

      // Extract embedding
      const embedding = await this.embeddingService.extractEmbedding(
        alignedFace,
        quality.score,
        {
          yaw: quality.metrics.yaw,
          pitch: quality.metrics.pitch,
          roll: quality.metrics.roll,
        },
      );

      return {
        success: true,
        embedding: embedding.vector,
        quality: quality.score,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Processing failed',
      };
    }
  }

  /**
   * Batch process multiple faces
   */
  async recognizeMultipleFaces(
    tenantId: string,
    frameId: string,
    cameraId: string,
    timestamp: Date,
    frameData: Buffer,
    frameWidth: number,
    frameHeight: number,
    detections: FaceDetection[],
    watchlistIds?: string[],
  ): Promise<FaceObservation[]> {
    // Process in parallel with concurrency limit
    const concurrency = 4;
    const observations: FaceObservation[] = [];

    for (let i = 0; i < detections.length; i += concurrency) {
      const batch = detections.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((detection) =>
          this.recognizeFace(
            tenantId,
            frameId,
            cameraId,
            timestamp,
            frameData,
            frameWidth,
            frameHeight,
            detection,
            watchlistIds,
          ),
        ),
      );
      observations.push(...batchResults);
    }

    return observations;
  }

  /**
   * Get watchlist-specific thresholds from database
   */
  async getWatchlistThresholds(
    db: Pool,
    tenantId: string,
    watchlistId: string,
  ): Promise<WatchlistThresholdConfig> {
    const result = await db.query(
      `
      SELECT
        match_threshold,
        review_threshold,
        minimum_margin,
        minimum_quality,
        temporal_confirmation_frames,
        temporal_window_seconds
      FROM face_watchlists
      WHERE tenant_id = $1 AND id = $2
    `,
      [tenantId, watchlistId],
    );

    if (result.rows.length === 0) {
      throw new Error('Watchlist not found');
    }

    const row = result.rows[0];
    return {
      matchThreshold: parseFloat(row.match_threshold) || 0.70,
      reviewThreshold: parseFloat(row.review_threshold) || 0.60,
      minimumMargin: parseFloat(row.minimum_margin) || 0.05,
      minimumQuality: parseFloat(row.minimum_quality) || 0.55,
      temporalConfirmationFrames: parseInt(row.temporal_confirmation_frames) || 3,
      temporalWindowSeconds: parseInt(row.temporal_window_seconds) || 2,
    };
  }

  /**
   * Health check
   */
  getHealth(): {
    initialized: boolean;
    embeddingService: ReturnType<FaceEmbeddingService['getHealth']>;
    config: FaceRecognitionConfig;
  } {
    return {
      initialized: this.isInitialized,
      embeddingService: this.embeddingService.getHealth(),
      config: this.config,
    };
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    await this.embeddingService.cleanup();
    this.isInitialized = false;
  }

  /**
   * Get services (for advanced usage)
   */
  getServices() {
    return {
      quality: this.qualityService,
      alignment: this.alignmentService,
      embedding: this.embeddingService,
      search: this.searchService,
      decision: this.decisionPolicy,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FaceRecognitionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): FaceRecognitionConfig {
    return { ...this.config };
  }
}
