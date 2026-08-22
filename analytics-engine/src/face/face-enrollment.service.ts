/**
 * Face Enrollment Service
 * Handles person enrollment with multi-image support and quality validation
 */

import type { Pool } from 'pg';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { FaceRecognitionService } from './face-recognition.service.js';
import type {
  EnrollmentResult,
  EnrollmentImageResult,
  FaceDetection,
} from './face.types.js';

export interface EnrollPersonInput {
  tenantId: string;
  watchlistId: string;
  displayName: string;
  externalId?: string;
  images: Buffer[];
  metadata?: Record<string, unknown>;
  actorId: string;
}

export interface FaceEnrollmentConfig {
  maxImagesPerPerson: number;
  minImagesPerPerson: number;
  checkDuplicates: boolean;
  duplicateThreshold: number;
  retainImages: boolean;
  imageStoragePath?: string;
}

export interface FaceDetector {
  detect(imageData: Buffer, width: number, height: number): Promise<FaceDetection[]>;
}

export class FaceEnrollmentService {
  private db: Pool;
  private recognitionService: FaceRecognitionService;
  private config: FaceEnrollmentConfig;
  private faceDetector?: FaceDetector;

  constructor(
    db: Pool,
    recognitionService: FaceRecognitionService,
    config?: Partial<FaceEnrollmentConfig>,
    faceDetector?: FaceDetector,
  ) {
    this.db = db;
    this.recognitionService = recognitionService;
    this.faceDetector = faceDetector;
    this.config = {
      maxImagesPerPerson: 10,
      minImagesPerPerson: 1,
      checkDuplicates: true,
      duplicateThreshold: 0.90,
      retainImages: false,
      ...config,
    };
  }

  /**
   * Enroll person with multiple images
   */
  async enrollPerson(input: EnrollPersonInput): Promise<EnrollmentResult> {
    // Validate input
    if (input.images.length < this.config.minImagesPerPerson) {
      throw new Error(
        `At least ${this.config.minImagesPerPerson} image(s) required for enrollment`,
      );
    }

    if (input.images.length > this.config.maxImagesPerPerson) {
      throw new Error(
        `Maximum ${this.config.maxImagesPerPerson} images allowed per person`,
      );
    }

    // Process in transaction
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Validate watchlist exists and is enabled
      const watchlistResult = await client.query(
        `
        SELECT id, tenant_id, enabled
        FROM face_watchlists
        WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL
      `,
        [input.watchlistId, input.tenantId],
      );

      if (watchlistResult.rows.length === 0) {
        throw new Error('Watchlist not found or not accessible');
      }

      if (!watchlistResult.rows[0].enabled) {
        throw new Error('Watchlist is disabled');
      }

      // Process images
      const imageResults = await this.processImages(input.images);

      // Filter successful embeddings
      const successfulEmbeddings = imageResults.filter((r) => r.success);

      if (successfulEmbeddings.length === 0) {
        throw new Error('No suitable images for enrollment. All images failed quality checks.');
      }

      // Check for duplicates if enabled
      if (this.config.checkDuplicates && successfulEmbeddings.length > 0 && successfulEmbeddings[0].embedding) {
        const firstEmbedding = successfulEmbeddings[0].embedding!;
        const searchService = this.recognitionService.getServices().search;
        
        const duplicates = await searchService.findDuplicates(
          input.tenantId,
          input.watchlistId,
          firstEmbedding,
          this.config.duplicateThreshold,
        );

        if (duplicates.length > 0) {
          throw new Error(
            `Potential duplicate found: ${duplicates[0].displayName} ` +
            `(similarity: ${(duplicates[0].bestSimilarity * 100).toFixed(1)}%). ` +
            `Please review before enrolling.`,
          );
        }
      }

      // Create person record
      const personResult = await client.query(
        `
        INSERT INTO face_watchlist_persons (
          tenant_id, watchlist_id, external_id, full_name,
          metadata, enrolled_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `,
        [
          input.tenantId,
          input.watchlistId,
          input.externalId || null,
          input.displayName,
          JSON.stringify(input.metadata || {}),
          input.actorId,
        ],
      );

      const personId = personResult.rows[0].id;

      // Store embeddings
      const embeddingIds: string[] = [];
      const failures: EnrollmentResult['failures'] = [];

      for (let i = 0; i < imageResults.length; i++) {
        const result = imageResults[i];

        if (!result.success) {
          failures.push({
            imageIndex: i,
            reason: result.error || 'Unknown error',
            details: result.reason,
          });
          continue;
        }

        // Calculate image hash
        const imageHash = crypto
          .createHash('sha256')
          .update(input.images[i])
          .digest('hex');

        // Store embedding
        const embeddingResult = await client.query(
          `
          INSERT INTO face_embeddings (
            tenant_id, person_id, embedding,
            quality_score, image_sha256,
            model_name, model_version
          ) VALUES ($1, $2, $3::vector, $4, $5, $6, $7)
          RETURNING id
        `,
          [
            input.tenantId,
            personId,
            this.formatVectorForPostgres(result.embedding!),
            result.quality,
            imageHash,
            this.recognitionService.getConfig().modelName,
            this.recognitionService.getConfig().modelVersion,
          ],
        );

        embeddingIds.push(embeddingResult.rows[0].id);
      }

      // Audit log
      await client.query(
        `
        INSERT INTO analytics_audit_log (
          tenant_id, user_id, action, resource_type, resource_id, details
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `,
        [
          input.tenantId,
          input.actorId,
          'face_enrol',
          'face_person',
          personId,
          JSON.stringify({
            watchlistId: input.watchlistId,
            displayName: input.displayName,
            acceptedImages: embeddingIds.length,
            rejectedImages: failures.length,
          }),
        ],
      );

      await client.query('COMMIT');

      return {
        personId,
        acceptedImages: embeddingIds.length,
        rejectedImages: failures.length,
        embeddings: embeddingIds.map((id, idx) => ({
          id,
          quality: successfulEmbeddings[idx]?.quality || 0,
        })),
        failures,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process enrollment images
   */
  private async processImages(images: Buffer[]): Promise<EnrollmentImageResult[]> {
    const results: EnrollmentImageResult[] = [];

    for (const imageBuffer of images) {
      try {
        // Decode image
        const image = sharp(imageBuffer);
        const metadata = await image.metadata();

        if (!metadata.width || !metadata.height) {
          results.push({
            success: false,
            error: 'Invalid image: missing dimensions',
          });
          continue;
        }

        // Convert to raw RGB buffer
        const rawBuffer = await image
          .raw()
          .ensureAlpha()
          .toBuffer({ resolveWithObject: true });

        if (!this.faceDetector) {
          results.push({ success: false, error: 'Face detector is not configured' });
          continue;
        }
        const detections = await this.faceDetector.detect(rawBuffer.data, metadata.width, metadata.height);
        if (detections.length !== 1) {
          results.push({ success: false, error: detections.length === 0 ? 'No face detected' : 'Exactly one face must be present' });
          continue;
        }

        // Process face
        const result = await this.recognitionService.processFaceForEnrollment(
          rawBuffer.data,
          metadata.width,
          metadata.height,
          detections[0]!,
        );

        if (result.success) {
          results.push({
            success: true,
            embedding: result.embedding,
            quality: result.quality,
          });
        } else {
          results.push({
            success: false,
            error: result.error,
          });
        }
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Processing failed',
        });
      }
    }

    return results;
  }

  /**
   * Add additional images to existing person
   */
  async addPersonImages(
    tenantId: string,
    personId: string,
    images: Buffer[],
    actorId: string,
  ): Promise<{
    added: number;
    failed: number;
    embeddingIds: string[];
  }> {
    // Verify person exists
    const personResult = await this.db.query(
      `
      SELECT id, watchlist_id
      FROM face_watchlist_persons
      WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL
    `,
      [personId, tenantId],
    );

    if (personResult.rows.length === 0) {
      throw new Error('Person not found');
    }

    // Check current embedding count
    const countResult = await this.db.query(
      `SELECT COUNT(*) as count FROM face_embeddings WHERE person_id = $1`,
      [personId],
    );
    const currentCount = parseInt(countResult.rows[0].count);

    if (currentCount + images.length > this.config.maxImagesPerPerson) {
      throw new Error(
        `Would exceed maximum of ${this.config.maxImagesPerPerson} images per person`,
      );
    }

    // Process images
    const imageResults = await this.processImages(images);
    const successfulEmbeddings = imageResults.filter((r) => r.success);

    // Store embeddings
    const embeddingIds: string[] = [];

    for (const result of successfulEmbeddings) {
      const imageHash = crypto.randomBytes(16).toString('hex');

      const embeddingResult = await this.db.query(
        `
        INSERT INTO face_embeddings (
          tenant_id, person_id, embedding,
          quality_score, image_sha256,
          model_name, model_version
        ) VALUES ($1, $2, $3::vector, $4, $5, $6, $7)
        RETURNING id
      `,
        [
          tenantId,
          personId,
          this.formatVectorForPostgres(result.embedding!),
          result.quality,
          imageHash,
          this.recognitionService.getConfig().modelName,
          this.recognitionService.getConfig().modelVersion,
        ],
      );

      embeddingIds.push(embeddingResult.rows[0].id);
    }

    // Audit log
    await this.db.query(
      `
      INSERT INTO analytics_audit_log (
        tenant_id, user_id, action, resource_type, resource_id, details
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `,
      [
        tenantId,
        actorId,
        'face_add_images',
        'face_person',
        personId,
        JSON.stringify({
          addedImages: embeddingIds.length,
          failedImages: imageResults.length - successfulEmbeddings.length,
        }),
      ],
    );

    return {
      added: embeddingIds.length,
      failed: imageResults.length - successfulEmbeddings.length,
      embeddingIds,
    };
  }

  /**
   * Remove person from watchlist
   */
  async removePerson(
    tenantId: string,
    personId: string,
    actorId: string,
  ): Promise<void> {
    await this.db.query(
      `
      UPDATE face_watchlist_persons
      SET archived_at = NOW()
      WHERE id = $1 AND tenant_id = $2
    `,
      [personId, tenantId],
    );

    // Audit log
    await this.db.query(
      `
      INSERT INTO analytics_audit_log (
        tenant_id, user_id, action, resource_type, resource_id
      ) VALUES ($1, $2, $3, $4, $5)
    `,
      [tenantId, actorId, 'face_person_removed', 'face_person', personId],
    );
  }

  /**
   * Format vector for PostgreSQL
   */
  private formatVectorForPostgres(embedding: Float32Array): string {
    return `[${Array.from(embedding).join(',')}]`;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FaceEnrollmentConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get configuration
   */
  getConfig(): FaceEnrollmentConfig {
    return { ...this.config };
  }
}
