/**
 * Multi-Camera Person Re-Identification (Re-ID) Orchestration Service
 * 
 * Coordinates visual feature normalization, multi-camera spatio-temporal validation,
 * global identity resolution, cross-camera journey reconstruction, and forensic probe search.
 */

import type { Pool } from 'pg';
import {
  ReidFeatureExtractor,
  REID_EMBEDDING_DIMENSION,
  type BoundingBox,
} from './reid-feature-extractor.js';
import {
  ReidTopologyValidator,
  type CameraTopologyEdge,
  type SpatioTemporalValidationResult,
} from './reid-topology.js';
import {
  ReidRepository,
  type ReidGlobalIdentity,
  type ReidCameraSighting,
  type ReidCameraTopologyRecord,
  type ReidStats,
} from './reid-repository.js';
import type { ControlPlaneStore } from '../../control-plane-store.js';

export interface IngestSightingInput {
  tenantId: string;
  branchId?: string | null;
  cameraId: string;
  localTrackId: string;
  enteredAt: Date | string;
  exitedAt: Date | string;
  embedding?: number[];
  rawCropRgb?: {
    buffer: Uint8Array;
    width: number;
    height: number;
    channels?: 3 | 4;
  };
  confidence: number;
  boundingBox: BoundingBox;
  snapshotUrl?: string | null;
  metrics?: Record<string, any>;
  similarityThreshold?: number;
}

export interface IngestSightingResult {
  matched: boolean;
  globalId: string;
  similarity: number;
  integratedScore: number;
  isNewIdentity: boolean;
  isCrossCameraTransition: boolean;
  previousCameraId?: string;
  transitDurationSeconds?: number;
  sighting: ReidCameraSighting;
  spatioTemporalValid: boolean;
}

export interface ProbeSearchInput {
  tenantId: string;
  probeEmbedding?: number[];
  probeCropRgb?: {
    buffer: Uint8Array;
    width: number;
    height: number;
    channels?: 3 | 4;
  };
  similarityThreshold?: number;
  branchId?: string | null;
  fromTime?: Date | string;
  toTime?: Date | string;
  limit?: number;
  createdBy?: string | null;
}

export interface ProbeMatchResult {
  sighting: ReidCameraSighting;
  similarity: number;
  globalId: string;
}

export interface PersonJourneyStep {
  stepIndex: number;
  cameraId: string;
  cameraName?: string;
  enteredAt: Date;
  exitedAt: Date;
  dwellSeconds: number;
  confidence: number;
  qualityScore: number;
  snapshotUrl: string | null;
  boundingBox: BoundingBox;
}

export interface CameraTransitionSegment {
  fromCameraId: string;
  fromCameraName?: string;
  toCameraId: string;
  toCameraName?: string;
  departedAt: Date;
  arrivedAt: Date;
  transitDurationSeconds: number;
  isPlausible: boolean;
  reason?: string;
}

export interface PersonJourney {
  globalId: string;
  identity: ReidGlobalIdentity;
  totalSightings: number;
  uniqueCamerasCount: number;
  totalDwellSeconds: number;
  firstSeen: Date;
  lastSeen: Date;
  journeySpanSeconds: number;
  steps: PersonJourneyStep[];
  transitions: CameraTransitionSegment[];
}

export class ReidService {
  private readonly repository: ReidRepository;
  private readonly featureExtractor: ReidFeatureExtractor;
  private readonly topologyValidator: ReidTopologyValidator;

  constructor(
    pool?: Pool,
    private readonly store?: ControlPlaneStore
  ) {
    this.repository = new ReidRepository(pool);
    this.featureExtractor = new ReidFeatureExtractor();
    this.topologyValidator = new ReidTopologyValidator();
  }

  /**
   * Initialize topology rules from database/cache
   */
  public async initializeTopology(tenantId: string, branchId?: string): Promise<void> {
    const rules = await this.repository.getTopology(tenantId, branchId);
    this.topologyValidator.loadEdges(
      rules.map((r) => ({
        fromCameraId: r.from_camera_id,
        toCameraId: r.to_camera_id,
        minTransitSeconds: r.min_transit_seconds,
        maxTransitSeconds: r.max_transit_seconds,
        distanceMeters: r.distance_meters ?? undefined,
        transitionProbability: r.transition_probability,
        enabled: r.enabled,
      }))
    );
  }

  /**
   * Ingest a camera tracklet sighting, match against cross-camera gallery,
   * validate spatio-temporal continuity, and assign or create global identity.
   */
  public async ingestSighting(input: IngestSightingInput): Promise<IngestSightingResult> {
    const enteredAt = typeof input.enteredAt === 'string' ? new Date(input.enteredAt) : input.enteredAt;
    const exitedAt = typeof input.exitedAt === 'string' ? new Date(input.exitedAt) : input.exitedAt;
    const dwellSeconds = Math.max(0, (exitedAt.getTime() - enteredAt.getTime()) / 1000);

    // 1. Resolve & normalize embedding vector
    let embedding: number[];
    if (input.rawCropRgb) {
      embedding = this.featureExtractor.extractFromRgbBuffer(
        input.rawCropRgb.buffer,
        input.rawCropRgb.width,
        input.rawCropRgb.height,
        input.rawCropRgb.channels ?? 3
      );
    } else if (input.embedding) {
      embedding = ReidFeatureExtractor.normalizeL2(input.embedding);
    } else {
      throw new Error('Ingest sighting requires either embedding vector or rawCropRgb buffer');
    }

    // 2. Evaluate crop quality
    const quality = this.featureExtractor.evaluateQuality(input.boundingBox, input.confidence);
    const threshold = input.similarityThreshold ?? 0.72;

    // 3. Search gallery for visual similarity candidates
    const candidates = await this.repository.findSimilarIdentities(
      input.tenantId,
      embedding,
      threshold - 0.05, // Slightly lower threshold for candidate retrieval before spatio-temporal reranking
      10
    );

    let bestMatch: {
      identity: ReidGlobalIdentity;
      similarity: number;
      integratedScore: number;
      validation: SpatioTemporalValidationResult;
      priorCameraId?: string;
    } | null = null;

    // 4. Evaluate candidates against spatio-temporal topology
    for (const candidate of candidates) {
      // Get chronological sightings for candidate to inspect previous exit
      const priorSightings = await this.repository.getSightingsForIdentity(
        candidate.identity.global_id,
        input.tenantId
      );

      let validation: SpatioTemporalValidationResult = {
        isFeasible: true,
        transitDurationSeconds: 0,
        temporalScore: 1.0,
        isSameCamera: false,
      };
      let priorCameraId: string | undefined;

      if (priorSightings.length > 0) {
        const lastSighting = priorSightings[priorSightings.length - 1];
        priorCameraId = lastSighting.camera_id;

        validation = this.topologyValidator.validateTransition(
          {
            cameraId: lastSighting.camera_id,
            cameraName: lastSighting.camera_name,
            exitedAt: lastSighting.exited_at,
            globalId: candidate.identity.global_id,
          },
          input.cameraId,
          enteredAt
        );
      }

      if (validation.isFeasible) {
        const integratedScore = this.topologyValidator.computeIntegratedScore(
          candidate.similarity,
          validation,
          0.85
        );

        if (integratedScore >= threshold) {
          if (!bestMatch || integratedScore > bestMatch.integratedScore) {
            bestMatch = {
              identity: candidate.identity,
              similarity: candidate.similarity,
              integratedScore,
              validation,
              priorCameraId,
            };
          }
        }
      }
    }

    let globalId: string;
    let isNewIdentity = false;
    let isCrossCameraTransition = false;
    let previousCameraId: string | undefined;
    let transitDurationSeconds: number | undefined;

    if (bestMatch) {
      // Found verified cross-camera match
      globalId = bestMatch.identity.global_id;
      previousCameraId = bestMatch.priorCameraId;
      transitDurationSeconds = bestMatch.validation.transitDurationSeconds;

      if (previousCameraId && previousCameraId !== input.cameraId) {
        isCrossCameraTransition = true;
      }

      // Update gallery identity with new sighting and running average embedding
      await this.repository.updateGlobalIdentity(globalId, input.tenantId, {
        lastSeen: exitedAt,
        newCameraId: input.cameraId,
        newEmbedding: embedding,
        metadata: {
          lastTransitionDuration: transitDurationSeconds,
          lastQualityScore: quality.overallQuality,
        },
      });
    } else {
      // No match found -> create new persistent global identity
      isNewIdentity = true;
      globalId = `PERSON_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

      await this.repository.createGlobalIdentity(input.tenantId, {
        globalId,
        representativeEmbedding: embedding,
        firstSeen: enteredAt,
        lastSeen: exitedAt,
        appearances: 1,
        camerasVisited: [input.cameraId],
        primaryBranchId: input.branchId,
        metadata: {
          initialConfidence: input.confidence,
          initialQualityScore: quality.overallQuality,
        },
      });
    }

    // 5. Save sighting record in authoritative ledger
    const sighting = await this.repository.saveSighting(input.tenantId, {
      branchId: input.branchId,
      cameraId: input.cameraId,
      globalId,
      localTrackId: input.localTrackId,
      enteredAt,
      exitedAt,
      dwellSeconds,
      confidence: input.confidence,
      qualityScore: quality.overallQuality,
      boundingBox: input.boundingBox,
      snapshotUrl: input.snapshotUrl,
      embedding,
      metrics: {
        isNewIdentity,
        isCrossCameraTransition,
        previousCameraId,
        transitDurationSeconds,
        ...(input.metrics || {}),
      },
    });

    return {
      matched: !isNewIdentity,
      globalId,
      similarity: bestMatch ? bestMatch.similarity : 1.0,
      integratedScore: bestMatch ? bestMatch.integratedScore : 1.0,
      isNewIdentity,
      isCrossCameraTransition,
      previousCameraId,
      transitDurationSeconds,
      sighting,
      spatioTemporalValid: bestMatch ? bestMatch.validation.isFeasible : true,
    };
  }

  /**
   * Forensic Probe Search: Search across all cameras and historical footage
   * for appearances matching a visual embedding or crop.
   */
  public async probeSearch(input: ProbeSearchInput): Promise<{
    matches: ProbeMatchResult[];
    totalMatches: number;
    probeId: string;
  }> {
    let probeVector: number[];
    let probeType: 'vector' | 'crop_image' = 'vector';

    if (input.probeCropRgb) {
      probeVector = this.featureExtractor.extractFromRgbBuffer(
        input.probeCropRgb.buffer,
        input.probeCropRgb.width,
        input.probeCropRgb.height,
        input.probeCropRgb.channels ?? 3
      );
      probeType = 'crop_image';
    } else if (input.probeEmbedding) {
      probeVector = ReidFeatureExtractor.normalizeL2(input.probeEmbedding);
    } else {
      throw new Error('Probe search requires either probeEmbedding or probeCropRgb buffer');
    }

    const threshold = input.similarityThreshold ?? 0.70;
    const limit = input.limit ?? 50;

    // Search global identities matching probe
    const similarIdentities = await this.repository.findSimilarIdentities(
      input.tenantId,
      probeVector,
      threshold,
      limit
    );

    const matches: ProbeMatchResult[] = [];

    // Gather all sightings for matching identities
    for (const item of similarIdentities) {
      const sightings = await this.repository.getSightingsForIdentity(
        item.identity.global_id,
        input.tenantId
      );

      for (const s of sightings) {
        // Apply date filters if provided
        if (input.fromTime && s.entered_at < new Date(input.fromTime)) continue;
        if (input.toTime && s.exited_at > new Date(input.toTime)) continue;
        if (input.branchId && s.branch_id !== input.branchId) continue;

        // Compute exact sighting similarity
        const sim = ReidFeatureExtractor.cosineSimilarity(probeVector, s.embedding);
        if (sim >= threshold) {
          matches.push({
            sighting: s,
            similarity: sim,
            globalId: item.identity.global_id,
          });
        }
      }
    }

    // Rank by similarity descending
    matches.sort((a, b) => b.similarity - a.similarity);
    const topMatches = matches.slice(0, limit);

    // Save probe search to audit ledger
    const probeRecord = await this.repository.saveProbeSearch(input.tenantId, {
      createdBy: input.createdBy,
      probeType,
      probeEmbedding: probeVector,
      similarityThreshold: threshold,
      branchId: input.branchId,
      fromTime: input.fromTime ? new Date(input.fromTime) : null,
      toTime: input.toTime ? new Date(input.toTime) : null,
      matchCount: topMatches.length,
    });

    return {
      matches: topMatches,
      totalMatches: matches.length,
      probeId: probeRecord.id,
    };
  }

  /**
   * Reconstruct the full cross-camera journey and timeline for a global identity
   */
  public async getPersonJourney(globalId: string, tenantId: string): Promise<PersonJourney | null> {
    const identity = await this.repository.getGlobalIdentity(globalId, tenantId);
    if (!identity) return null;

    const sightings = await this.repository.getSightingsForIdentity(globalId, tenantId);
    if (sightings.length === 0) return null;

    const steps: PersonJourneyStep[] = sightings.map((s, index) => ({
      stepIndex: index + 1,
      cameraId: s.camera_id,
      cameraName: s.camera_name || `Camera ${s.camera_id.substring(0, 8)}`,
      enteredAt: s.entered_at,
      exitedAt: s.exited_at,
      dwellSeconds: s.dwell_seconds,
      confidence: s.confidence,
      qualityScore: s.quality_score,
      snapshotUrl: s.snapshot_url,
      boundingBox: s.bounding_box,
    }));

    const transitions: CameraTransitionSegment[] = [];

    for (let i = 0; i < sightings.length - 1; i++) {
      const from = sightings[i];
      const to = sightings[i + 1];

      const transitMs = to.entered_at.getTime() - from.exited_at.getTime();
      const transitDurationSeconds = transitMs / 1000.0;

      const validation = this.topologyValidator.validateTransition(
        {
          cameraId: from.camera_id,
          cameraName: from.camera_name,
          exitedAt: from.exited_at,
          globalId,
        },
        to.camera_id,
        to.entered_at
      );

      transitions.push({
        fromCameraId: from.camera_id,
        fromCameraName: from.camera_name || `Camera ${from.camera_id.substring(0, 8)}`,
        toCameraId: to.camera_id,
        toCameraName: to.camera_name || `Camera ${to.camera_id.substring(0, 8)}`,
        departedAt: from.exited_at,
        arrivedAt: to.entered_at,
        transitDurationSeconds: Math.max(0, transitDurationSeconds),
        isPlausible: validation.isFeasible,
        reason: validation.reason,
      });
    }

    const firstSeen = sightings[0].entered_at;
    const lastSeen = sightings[sightings.length - 1].exited_at;
    const journeySpanSeconds = Math.max(0, (lastSeen.getTime() - firstSeen.getTime()) / 1000);
    const totalDwellSeconds = sightings.reduce((acc, s) => acc + s.dwell_seconds, 0);
    const uniqueCameras = new Set(sightings.map((s) => s.camera_id));

    return {
      globalId,
      identity,
      totalSightings: sightings.length,
      uniqueCamerasCount: uniqueCameras.size,
      totalDwellSeconds,
      firstSeen,
      lastSeen,
      journeySpanSeconds,
      steps,
      transitions,
    };
  }

  // Pass-through repository helpers
  public async getIdentities(filter: {
    tenantId: string;
    branchId?: string;
    status?: 'active' | 'archived';
    limit?: number;
    offset?: number;
  }): Promise<{ identities: ReidGlobalIdentity[]; total: number }> {
    return this.repository.listGlobalIdentities(filter);
  }

  public async getIdentity(globalId: string, tenantId: string): Promise<ReidGlobalIdentity | null> {
    return this.repository.getGlobalIdentity(globalId, tenantId);
  }

  public async getTopology(tenantId: string, branchId?: string): Promise<ReidCameraTopologyRecord[]> {
    return this.repository.getTopology(tenantId, branchId);
  }

  public async setTopologyRule(
    tenantId: string,
    rule: {
      branchId: string;
      fromCameraId: string;
      toCameraId: string;
      minTransitSeconds: number;
      maxTransitSeconds: number;
      distanceMeters?: number | null;
      transitionProbability?: number;
      enabled?: boolean;
    }
  ): Promise<ReidCameraTopologyRecord> {
    const saved = await this.repository.upsertTopologyRule(tenantId, rule);
    this.topologyValidator.addEdge({
      fromCameraId: saved.from_camera_id,
      toCameraId: saved.to_camera_id,
      minTransitSeconds: saved.min_transit_seconds,
      maxTransitSeconds: saved.max_transit_seconds,
      distanceMeters: saved.distance_meters ?? undefined,
      transitionProbability: saved.transition_probability,
      enabled: saved.enabled,
    });
    return saved;
  }

  public async getStats(tenantId: string): Promise<ReidStats> {
    return this.repository.getStats(tenantId);
  }
}
