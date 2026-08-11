/**
 * Human Analytics Integration for Journey System
 * 
 * This file shows how to integrate the journey system with human-analytics.ts.
 * Apply these changes to your existing HumanAnalyticsDetector class.
 */

import { Pool } from 'pg';
import { TrackEmbeddingAccumulator } from './embedding.service.js';
import { getEmbeddingService, EmbeddingQualityAssessor } from './embedding.service.js';
import { getJourneyService } from './journey.service.js';
import { getObservationRepository } from './observation.repository.js';
import { getCameraTopologyService } from './topology.service.js';
import { getReIdVectorRepository } from './reid-vector.repository.js';
import { getGlobalIdentityResolver } from './global-identity-resolver.js';
import { getPersonTransitionCorrelator } from './transition-correlator.js';
import type { NewPersonObservation, PersonJourney, JourneyQueryOptions } from './journey.types.js';

/**
 * Integration: Add to HumanAnalyticsDetector class
 */
export class JourneyIntegration {
  private embeddingAccumulators = new Map<string, TrackEmbeddingAccumulator>();
  private journeyService: any; // JourneyService
  private embeddingService: any;

  constructor(private pool: Pool) {
    // Initialize journey services
    const observations = getObservationRepository(pool);
    const topology = getCameraTopologyService(pool);
    const vectors = getReIdVectorRepository(pool);
    const identityResolver = getGlobalIdentityResolver(pool, observations, topology, vectors);
    const transitionCorrelator = getPersonTransitionCorrelator(pool, observations, topology, vectors);
    
    this.journeyService = getJourneyService(
      pool,
      observations,
      topology,
      vectors,
      identityResolver,
      transitionCorrelator
    );

    this.embeddingService = getEmbeddingService();
  }

  /**
   * Call this when processing each frame for a track
   */
  async onFrameUpdate(
    trackId: string,
    detection: {
      embedding?: Float32Array;
      confidence: number;
      boundingBox: { x: number; y: number; width: number; height: number };
      frameId?: string;
      timestamp: Date;
      frameWidth: number;
      frameHeight: number;
    }
  ): Promise<void> {
    if (!detection.embedding) {
      return; // No embedding available
    }

    // Get or create accumulator for this track
    let accumulator = this.embeddingAccumulators.get(trackId);
    if (!accumulator) {
      accumulator = this.embeddingService.createTrackAccumulator();
      this.embeddingAccumulators.set(trackId, accumulator);
    }

    // Assess quality
    const quality = EmbeddingQualityAssessor.assessPersonCropQuality(
      detection.boundingBox,
      detection.confidence,
      detection.frameWidth,
      detection.frameHeight,
      {
        // Add metadata if available from your detector
        // occlusionRatio: ...,
        // motionBlur: ...,
        // lighting: ...,
        // pose: ...
      }
    );

    // Add sample to accumulator
    accumulator.add(
      detection.embedding,
      detection.confidence,
      quality,
      detection.frameId,
      detection.timestamp,
      detection.boundingBox
    );
  }

  /**
   * Call this when a track ends
   */
  async onTrackEnded(track: {
    id: string;
    tenantId: string;
    branchId: string;
    cameraId: string;
    startedAt: Date;
    endedAt: Date;
    confidence: number;
    entryZone?: string;
    exitZone?: string;
    thumbnailPath?: string;
  }): Promise<{
    observationId: string;
    globalPersonId: string;
    isNewIdentity: boolean;
  } | null> {
    const accumulator = this.embeddingAccumulators.get(track.id);
    if (!accumulator) {
      console.warn('[Journey] No embedding accumulator for track:', track.id);
      return null;
    }

    const representativeEmbedding = accumulator.getRepresentativeEmbedding();
    if (!representativeEmbedding) {
      console.warn('[Journey] No representative embedding for track:', track.id);
      this.embeddingAccumulators.delete(track.id);
      return null;
    }

    try {
      // Create observation and resolve identity
      const result = await this.journeyService.handleTrackCompleted(
        {
          tenantId: track.tenantId,
          branchId: track.branchId,
          cameraId: track.cameraId,
          trackId: track.id,
          enteredAt: track.startedAt,
          exitedAt: track.endedAt,
          embedding: representativeEmbedding,
          embeddingQuality: accumulator.getAverageQuality(),
          detectionConfidence: track.confidence,
          entryZoneId: track.entryZone,
          exitZoneId: track.exitZone,
          thumbnailUri: track.thumbnailPath
        } as NewPersonObservation,
        representativeEmbedding,
        accumulator.getAverageQuality(),
        'osnet_x1_0', // Your ReID model name
        '2026-08-01'  // Your model version
      );

      console.log(`[Journey] Track completed: ${track.id} → ${result.globalPersonId} (${result.isNewIdentity ? 'NEW' : 'MATCHED'})`);

      // Clean up accumulator
      this.embeddingAccumulators.delete(track.id);

      return result;
    } catch (error) {
      console.error('[Journey] Track completion failed:', error);
      this.embeddingAccumulators.delete(track.id);
      return null;
    }
  }

  /**
   * Replace getPersonJourney implementation
   */
  async getPersonJourney(
    tenantId: string,
    globalPersonId: string,
    options?: JourneyQueryOptions
  ): Promise<PersonJourney> {
    return await this.journeyService.getPersonJourney(tenantId, globalPersonId, options);
  }

  /**
   * Search for person by embedding
   */
  async searchPerson(
    tenantId: string,
    embedding: number[],
    options?: {
      branchId?: string;
      fromTime?: Date;
      toTime?: Date;
      minSimilarity?: number;
      maxResults?: number;
    }
  ) {
    return await this.journeyService.searchPerson({
      tenantId,
      embedding,
      ...options
    });
  }
}

/**
 * INTEGRATION INSTRUCTIONS:
 * 
 * 1. In HumanAnalyticsDetector constructor, add:
 * 
 *    private journeyIntegration: JourneyIntegration;
 * 
 *    constructor(pool: Pool) {
 *      // ... existing code ...
 *      this.journeyIntegration = new JourneyIntegration(pool);
 *    }
 * 
 * 2. In your frame processing loop, add:
 * 
 *    for (const track of activeTracks) {
 *      await this.journeyIntegration.onFrameUpdate(track.id, {
 *        embedding: track.currentEmbedding,
 *        confidence: track.confidence,
 *        boundingBox: track.bbox,
 *        frameId: frameId,
 *        timestamp: new Date(),
 *        frameWidth: frameWidth,
 *        frameHeight: frameHeight
 *      });
 *    }
 * 
 * 3. When track ends, call:
 * 
 *    await this.journeyIntegration.onTrackEnded({
 *      id: track.id,
 *      tenantId: this.tenantId,
 *      branchId: this.branchId,
 *      cameraId: this.cameraId,
 *      startedAt: track.firstSeen,
 *      endedAt: track.lastSeen,
 *      confidence: track.averageConfidence,
 *      entryZone: track.entryZone,
 *      exitZone: track.exitZone,
 *      thumbnailPath: track.thumbnailPath
 *    });
 * 
 * 4. Replace getPersonJourney method:
 * 
 *    async getPersonJourney(tenantId: string, globalPersonId: string, options?) {
 *      return await this.journeyIntegration.getPersonJourney(tenantId, globalPersonId, options);
 *    }
 * 
 * 5. Initialize journey tables on startup:
 * 
 *    await journeyIntegration.journeyService.initialize();
 */

/**
 * Example: Complete integration in human-analytics.ts
 */
/*
class HumanAnalyticsDetector {
  private journeyIntegration: JourneyIntegration;
  
  constructor(private pool: Pool) {
    this.journeyIntegration = new JourneyIntegration(pool);
  }
  
  async processFrame(frame: Frame) {
    // ... existing detection and tracking code ...
    
    // Add embedding accumulation
    for (const track of this.activeTracks.values()) {
      if (track.currentEmbedding) {
        await this.journeyIntegration.onFrameUpdate(track.id, {
          embedding: track.currentEmbedding,
          confidence: track.confidence,
          boundingBox: track.bbox,
          frameId: frame.id,
          timestamp: frame.timestamp,
          frameWidth: frame.width,
          frameHeight: frame.height
        });
      }
    }
  }
  
  private async onTrackLost(trackId: string) {
    const track = this.activeTracks.get(trackId);
    if (!track) return;
    
    // Handle track completion
    const result = await this.journeyIntegration.onTrackEnded({
      id: track.id,
      tenantId: this.tenantId,
      branchId: this.branchId,
      cameraId: this.cameraId,
      startedAt: track.firstSeen,
      endedAt: track.lastSeen,
      confidence: track.averageConfidence,
      entryZone: track.entryZone,
      exitZone: track.exitZone,
      thumbnailPath: track.thumbnailPath
    });
    
    if (result) {
      console.log(`Journey tracked: ${result.globalPersonId}`);
    }
    
    this.activeTracks.delete(trackId);
  }
  
  async getPersonJourney(
    tenantId: string, 
    globalPersonId: string, 
    options?: JourneyQueryOptions
  ): Promise<PersonJourney> {
    return await this.journeyIntegration.getPersonJourney(
      tenantId, 
      globalPersonId, 
      options
    );
  }
}
*/
