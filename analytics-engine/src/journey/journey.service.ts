/**
 * Journey Service
 * 
 * Orchestrates cross-camera journey tracking by:
 * - Managing observation lifecycle
 * - Coordinating identity resolution and transition correlation
 * - Providing journey queries and search functionality
 * - Managing journey sessions
 */

import { EventEmitter } from 'events';
import { Logger } from '../core/logger';
import { ObservationRepository } from './observation.repository';
import { TransitionCorrelator } from './transition-correlator';
import { GlobalIdentityResolver } from './global-identity-resolver';
import { EmbeddingService } from './embedding.service';
import { TopologyService } from './topology.service';
import {
  PersonObservation,
  PersonTransition,
  GlobalPerson,
  PersonJourney,
  JourneySession,
  JourneyAppearance,
  JourneyTransition,
  JourneyGap,
  NewPersonObservation,
  PersonTrackData,
  SearchByImageRequest,
  SearchByImageResult,
  JourneyQueryOptions,
  GlobalPersonStatus
} from './journey.types';

export interface JourneyServiceConfig {
  sessionTimeoutMs?: number; // Default: 10 minutes
  minSessionConfidence?: number; // Default: 0.75
  maxGapDurationMs?: number; // Default: 5 minutes
  enableAutoLearning?: boolean; // Default: true
}

export class JourneyService extends EventEmitter {
  private logger: Logger;
  private config: Required<JourneyServiceConfig>;

  constructor(
    private observationRepo: ObservationRepository,
    private transitionCorrelator: TransitionCorrelator,
    private identityResolver: GlobalIdentityResolver,
    private embeddingService: EmbeddingService,
    private topologyService: TopologyService,
    config: JourneyServiceConfig = {}
  ) {
    super();
    this.logger = Logger.getInstance();
    this.config = {
      sessionTimeoutMs: config.sessionTimeoutMs ?? 10 * 60 * 1000,
      minSessionConfidence: config.minSessionConfidence ?? 0.75,
      maxGapDurationMs: config.maxGapDurationMs ?? 5 * 60 * 1000,
      enableAutoLearning: config.enableAutoLearning ?? true
    };
  }

  /**
   * Process a completed track from a camera detector
   * This is the main entry point from human-analytics.ts
   */
  async processCompletedTrack(
    trackData: PersonTrackData
  ): Promise<PersonObservation> {
    this.logger.info('Processing completed track', {
      tenantId: trackData.tenantId,
      cameraId: trackData.cameraId,
      trackId: trackData.trackId
    });

    try {
      // Step 1: Generate representative embedding
      const embedding = await this.embeddingService.createRepresentativeEmbedding(
        trackData.samples
      );

      if (!embedding) {
        throw new Error('Failed to generate representative embedding');
      }

      // Step 2: Create observation record
      const newObservation: NewPersonObservation = {
        tenantId: trackData.tenantId,
        branchId: trackData.branchId,
        cameraId: trackData.cameraId,
        trackId: trackData.trackId,
        enteredAt: trackData.startedAt,
        exitedAt: trackData.endedAt,
        entryZoneId: trackData.entryZoneId,
        exitZoneId: trackData.exitZoneId,
        representativeEmbedding: embedding.vector,
        embeddingQuality: embedding.quality,
        detectionConfidence: trackData.confidence,
        thumbnailUri: trackData.thumbnailUri,
        associationMethod: 'LOCAL_TRACK'
      };

      const observation = await this.observationRepo.create(newObservation);

      this.emit('observation.created', { observation });

      // Step 3: Resolve global identity
      const identity = await this.identityResolver.resolve(observation);

      await this.observationRepo.assignGlobalIdentity(
        observation.id,
        identity.globalPersonId,
        identity.confidence
      );

      this.emit('identity.resolved', {
        observationId: observation.id,
        globalPersonId: identity.globalPersonId,
        confidence: identity.confidence
      });

      // Step 4: Correlate transitions
      const transition = await this.transitionCorrelator.correlate(
        { ...observation, globalPersonId: identity.globalPersonId }
      );

      if (transition) {
        this.emit('transition.created', { transition });

        // Step 5: Auto-learn topology if enabled
        if (this.config.enableAutoLearning && transition.status === 'CONFIRMED') {
          await this.topologyService.recordObservedTransition(
            transition.tenantId,
            transition.branchId || undefined,
            transition.fromCameraId,
            transition.toCameraId,
            transition.travelTimeMs
          );
        }
      }

      // Step 6: Update or create journey session
      await this.updateJourneySession(
        observation.tenantId,
        identity.globalPersonId,
        observation
      );

      this.logger.info('Track processing completed', {
        observationId: observation.id,
        globalPersonId: identity.globalPersonId,
        hasTransition: !!transition
      });

      return {
        ...observation,
        globalPersonId: identity.globalPersonId,
        identityConfidence: identity.confidence
      };

    } catch (error) {
      this.logger.error('Failed to process track', {
        error,
        trackData
      });
      throw error;
    }
  }

  /**
   * Get complete journey for a person
   */
  async getPersonJourney(
    tenantId: string,
    globalPersonId: string,
    options: JourneyQueryOptions = {}
  ): Promise<PersonJourney> {
    this.logger.debug('Querying person journey', {
      tenantId,
      globalPersonId,
      options
    });

    // Fetch observations
    const observations = await this.observationRepo.findByGlobalPerson({
      tenantId,
      globalPersonId,
      branchId: options.branchId,
      from: options.from,
      to: options.to
    });

    if (observations.length === 0) {
      return {
        globalPersonId,
        status: 'EMPTY',
        startedAt: null,
        endedAt: null,
        totalDurationMs: 0,
        cameraCount: 0,
        branchCount: 0,
        appearances: [],
        transitions: [],
        gaps: [],
        confidence: 0,
        unresolvedGaps: []
      };
    }

    // Fetch transitions
    const transitions = await this.observationRepo.getTransitions(
      tenantId,
      globalPersonId,
      options.from,
      options.to
    );

    // Build journey structure
    const appearances = this.buildAppearances(observations);
    const journeyTransitions = this.buildTransitions(transitions);
    const gaps = this.detectGaps(observations, transitions);

    const uniqueCameras = new Set(observations.map(o => o.cameraId));
    const uniqueBranches = new Set(
      observations.map(o => o.branchId).filter(Boolean)
    );

    const startedAt = observations[0].enteredAt;
    const endedAt = observations[observations.length - 1].exitedAt;
    const totalDurationMs = endedAt.getTime() - startedAt.getTime();

    const confidence = this.calculateJourneyConfidence(
      observations,
      transitions
    );

    return {
      globalPersonId,
      status: this.determineJourneyStatus(observations, transitions, gaps),
      startedAt,
      endedAt,
      totalDurationMs,
      cameraCount: uniqueCameras.size,
      branchCount: uniqueBranches.size,
      appearances,
      transitions: journeyTransitions,
      gaps,
      confidence,
      unresolvedGaps: gaps.filter(g => g.confidence < 0.5)
    };
  }

  /**
   * Search for a person across cameras using an image
   */
  async searchByImage(
    request: SearchByImageRequest
  ): Promise<SearchByImageResult[]> {
    this.logger.info('Searching by image', {
      tenantId: request.tenantId,
      branchId: request.branchId
    });

    // Generate embedding from query image
    const queryEmbedding = await this.embeddingService.generateEmbedding({
      imageBuffer: request.imageBuffer,
      boundingBox: request.boundingBox
    });

    if (!queryEmbedding || queryEmbedding.quality < 0.5) {
      throw new Error('Failed to generate quality embedding from query image');
    }

    // Search for similar observations
    const matches = await this.observationRepo.searchByEmbedding({
      tenantId: request.tenantId,
      branchId: request.branchId,
      embedding: queryEmbedding.vector,
      from: request.from,
      to: request.to,
      minSimilarity: request.minSimilarity ?? 0.75,
      limit: request.limit ?? 50
    });

    // Group by global person and aggregate
    const personMap = new Map<string, {
      globalPersonId: string;
      observations: PersonObservation[];
      maxSimilarity: number;
    }>();

    for (const match of matches) {
      if (!match.globalPersonId) continue;

      const existing = personMap.get(match.globalPersonId);
      if (!existing) {
        personMap.set(match.globalPersonId, {
          globalPersonId: match.globalPersonId,
          observations: [match],
          maxSimilarity: match.similarity || 0
        });
      } else {
        existing.observations.push(match);
        existing.maxSimilarity = Math.max(
          existing.maxSimilarity,
          match.similarity || 0
        );
      }
    }

    // Build results
    const results: SearchByImageResult[] = [];

    for (const person of personMap.values()) {
      const firstSeen = person.observations[0].enteredAt;
      const lastSeen = person.observations[person.observations.length - 1].exitedAt;

      results.push({
        globalPersonId: person.globalPersonId,
        similarity: person.maxSimilarity,
        appearanceCount: person.observations.length,
        firstSeenAt: firstSeen,
        lastSeenAt: lastSeen,
        cameras: [...new Set(person.observations.map(o => o.cameraId))],
        branches: [...new Set(person.observations.map(o => o.branchId).filter(Boolean))] as string[],
        representativeObservation: person.observations[0]
      });
    }

    // Sort by similarity
    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, request.limit ?? 50);
  }

  /**
   * Get active journey sessions for a branch
   */
  async getActiveSessions(
    tenantId: string,
    branchId?: string
  ): Promise<JourneySession[]> {
    // This would query a journey_sessions table
    // For now, we'll derive sessions from recent observations
    const recentObservations = await this.observationRepo.findRecent(
      tenantId,
      branchId,
      this.config.sessionTimeoutMs
    );

    const sessionMap = new Map<string, PersonObservation[]>();

    for (const obs of recentObservations) {
      if (!obs.globalPersonId) continue;

      const key = `${obs.globalPersonId}-${obs.branchId || 'none'}`;
      const existing = sessionMap.get(key);
      if (existing) {
        existing.push(obs);
      } else {
        sessionMap.set(key, [obs]);
      }
    }

    const sessions: JourneySession[] = [];

    for (const [key, observations] of sessionMap.entries()) {
      const sorted = observations.sort(
        (a, b) => a.enteredAt.getTime() - b.enteredAt.getTime()
      );

      const startedAt = sorted[0].enteredAt;
      const endedAt = sorted[sorted.length - 1].exitedAt;
      const now = new Date();
      const timeSinceLastSeen = now.getTime() - endedAt.getTime();

      const status = timeSinceLastSeen < this.config.sessionTimeoutMs
        ? 'ACTIVE'
        : 'COMPLETED';

      const avgConfidence = observations.reduce(
        (sum, o) => sum + (o.identityConfidence || 0),
        0
      ) / observations.length;

      sessions.push({
        id: `session-${observations[0].globalPersonId}-${startedAt.getTime()}`,
        tenantId,
        globalPersonId: observations[0].globalPersonId!,
        branchId: observations[0].branchId,
        startedAt,
        endedAt: status === 'COMPLETED' ? endedAt : undefined,
        status,
        observationCount: observations.length,
        overallConfidence: avgConfidence
      });
    }

    return sessions;
  }

  /**
   * Merge two global person identities
   */
  async mergeGlobalPersons(
    tenantId: string,
    sourcePersonId: string,
    targetPersonId: string,
    reason?: string
  ): Promise<void> {
    this.logger.info('Merging global persons', {
      tenantId,
      sourcePersonId,
      targetPersonId,
      reason
    });

    await this.observationRepo.mergeGlobalPersons(
      tenantId,
      sourcePersonId,
      targetPersonId
    );

    this.emit('persons.merged', {
      tenantId,
      sourcePersonId,
      targetPersonId,
      reason
    });
  }

  // ==================== Private Helper Methods ====================

  private buildAppearances(
    observations: PersonObservation[]
  ): JourneyAppearance[] {
    return observations.map(obs => ({
      observationId: obs.id,
      cameraId: obs.cameraId,
      cameraName: obs.cameraId, // Would fetch from camera service
      branchId: obs.branchId,
      enteredAt: obs.enteredAt,
      exitedAt: obs.exitedAt,
      durationMs: obs.exitedAt.getTime() - obs.enteredAt.getTime(),
      trackId: obs.trackId,
      thumbnailUri: obs.thumbnailUri,
      entryZoneId: obs.entryZoneId,
      exitZoneId: obs.exitZoneId,
      identityConfidence: obs.identityConfidence || 0
    }));
  }

  private buildTransitions(
    transitions: PersonTransition[]
  ): JourneyTransition[] {
    return transitions.map(trans => ({
      transitionId: trans.id,
      fromObservationId: trans.fromObservationId,
      toObservationId: trans.toObservationId,
      fromCameraId: trans.fromCameraId,
      toCameraId: trans.toCameraId,
      departedAt: trans.departedAt,
      arrivedAt: trans.arrivedAt,
      travelTimeMs: trans.travelTimeMs,
      confidence: trans.transitionConfidence,
      status: trans.status,
      reidSimilarity: trans.reidSimilarity,
      topologyScore: trans.topologyScore,
      temporalScore: trans.temporalScore
    }));
  }

  private detectGaps(
    observations: PersonObservation[],
    transitions: PersonTransition[]
  ): JourneyGap[] {
    const gaps: JourneyGap[] = [];

    // Create a set of observation IDs that have transitions
    const observationsWithTransitions = new Set<string>();
    for (const trans of transitions) {
      observationsWithTransitions.add(trans.fromObservationId);
      observationsWithTransitions.add(trans.toObservationId);
    }

    // Find gaps between consecutive observations without transitions
    for (let i = 0; i < observations.length - 1; i++) {
      const current = observations[i];
      const next = observations[i + 1];

      // Check if there's no transition between these observations
      const hasTransition = transitions.some(
        t => t.fromObservationId === current.id &&
             t.toObservationId === next.id
      );

      if (!hasTransition) {
        const gapDuration = next.enteredAt.getTime() - current.exitedAt.getTime();

        // Only report significant gaps
        if (gapDuration > 30000) { // 30 seconds
          gaps.push({
            type: gapDuration > this.config.maxGapDurationMs
              ? 'UNRESOLVED_GAP'
              : 'SHORT_GAP',
            afterObservationId: current.id,
            beforeObservationId: next.id,
            afterCameraId: current.cameraId,
            beforeCameraId: next.cameraId,
            durationMs: gapDuration,
            confidence: gapDuration < 60000 ? 0.7 : 0.3
          });
        }
      }
    }

    return gaps;
  }

  private calculateJourneyConfidence(
    observations: PersonObservation[],
    transitions: PersonTransition[]
  ): number {
    if (observations.length === 0) return 0;

    // Average observation identity confidence
    const observationConfidence = observations.reduce(
      (sum, o) => sum + (o.identityConfidence || 0),
      0
    ) / observations.length;

    // Average transition confidence (if any)
    const transitionConfidence = transitions.length > 0
      ? transitions.reduce((sum, t) => sum + t.transitionConfidence, 0) / transitions.length
      : 1.0; // No transitions = single camera, full confidence

    // Penalize for missing transitions
    const expectedTransitions = observations.length - 1;
    const transitionCompleteness = expectedTransitions > 0
      ? transitions.length / expectedTransitions
      : 1.0;

    // Combined score
    return (
      observationConfidence * 0.4 +
      transitionConfidence * 0.4 +
      transitionCompleteness * 0.2
    );
  }

  private determineJourneyStatus(
    observations: PersonObservation[],
    transitions: PersonTransition[],
    gaps: JourneyGap[]
  ): 'COMPLETE' | 'PARTIAL' | 'FRAGMENTED' | 'EMPTY' {
    if (observations.length === 0) return 'EMPTY';
    if (observations.length === 1) return 'COMPLETE';

    const expectedTransitions = observations.length - 1;
    const hasAllTransitions = transitions.length === expectedTransitions;
    const hasSignificantGaps = gaps.some(g => g.type === 'UNRESOLVED_GAP');

    if (hasAllTransitions && !hasSignificantGaps) {
      return 'COMPLETE';
    } else if (transitions.length >= expectedTransitions * 0.7) {
      return 'PARTIAL';
    } else {
      return 'FRAGMENTED';
    }
  }

  private async updateJourneySession(
    tenantId: string,
    globalPersonId: string,
    observation: PersonObservation
  ): Promise<void> {
    // Session management would be implemented here
    // For now, we just emit an event
    this.emit('session.updated', {
      tenantId,
      globalPersonId,
      observationId: observation.id
    });
  }
}
