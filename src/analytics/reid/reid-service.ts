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
  type AppearanceSignature,
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
        const lastSighting = priorSightings[priorSightings.length - 1]!;
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
      const from = sightings[i]!;
      const to = sightings[i + 1]!;

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

    const firstSeen = sightings[0]!.entered_at;
    const lastSeen = sightings[sightings.length - 1]!.exited_at;
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

  /**
   * Reconstruct the 2D Floor Plan breadcrumb route map for a suspect identity
   * showing their contiguous path across branch cameras (Cam 1 ➡️ Cam 3 ➡️ Vault Cam 5).
   */
  public async getFloorPlanTrail(
    globalId: string,
    tenantId: string,
    branchId?: string,
    floorLevel: string = 'ground'
  ): Promise<FloorPlanRouteMap | null> {
    const identity = await this.repository.getGlobalIdentity(globalId, tenantId);
    if (!identity) return null;

    const sightings = await this.repository.getSightingsForIdentity(globalId, tenantId);
    if (sightings.length === 0) return null;

    // Filter by branch if specified
    const targetSightings = branchId
      ? sightings.filter((s) => !s.branch_id || s.branch_id === branchId)
      : sightings;

    if (targetSightings.length === 0) return null;

    // Load calibrated floor positions and branch cameras
    const effectiveBranchId = branchId || targetSightings[0]!.branch_id || undefined;
    const [savedPositions, branchCameras] = await Promise.all([
      this.repository.getCameraFloorPositions(tenantId, effectiveBranchId, floorLevel),
      this.repository.getBranchCameras(tenantId, effectiveBranchId),
    ]);

    const posMap = new Map<string, { x: number; y: number; zoneName: string; angle: number; fov: number }>();
    savedPositions.forEach((p) => {
      posMap.set(p.camera_id, {
        x: p.position_x,
        y: p.position_y,
        zoneName: p.zone_name || getDefaultCoordinatesForLocation(p.location_type, p.camera_name).zoneName,
        angle: p.angle_degrees,
        fov: p.fov_degrees,
      });
    });

    // Merge all branch cameras with coordinates
    const allBranchCameras: FloorPlanRouteMap['allBranchCameras'] = [];
    const knownCamIds = new Set<string>();

    branchCameras.forEach((cam, idx) => {
      knownCamIds.add(cam.id);
      const existing = posMap.get(cam.id);
      if (existing) {
        allBranchCameras.push({
          cameraId: cam.id,
          cameraName: cam.name,
          locationType: cam.locationType,
          zoneName: existing.zoneName,
          coordinates: { x: existing.x, y: existing.y },
          angleDegrees: existing.angle,
          fovDegrees: existing.fov,
          status: cam.status,
        });
      } else {
        const def = getDefaultCoordinatesForLocation(cam.locationType, cam.name, idx);
        posMap.set(cam.id, { x: def.x, y: def.y, zoneName: def.zoneName, angle: def.angle, fov: 75 });
        allBranchCameras.push({
          cameraId: cam.id,
          cameraName: cam.name,
          locationType: cam.locationType,
          zoneName: def.zoneName,
          coordinates: { x: def.x, y: def.y },
          angleDegrees: def.angle,
          fovDegrees: 75,
          status: cam.status,
        });
      }
    });

    // Also include any cameras referenced in sightings not in branch cameras list
    targetSightings.forEach((s, idx) => {
      if (!knownCamIds.has(s.camera_id)) {
        knownCamIds.add(s.camera_id);
        let existingPos = posMap.get(s.camera_id);
        if (!existingPos) {
          const def = getDefaultCoordinatesForLocation(undefined, s.camera_name, idx);
          existingPos = { x: def.x, y: def.y, zoneName: def.zoneName, angle: def.angle, fov: 75 };
          posMap.set(s.camera_id, existingPos);
        }
        allBranchCameras.push({
          cameraId: s.camera_id,
          cameraName: s.camera_name || `Camera ${s.camera_id.slice(0, 8)}`,
          zoneName: existingPos.zoneName,
          coordinates: { x: existingPos.x, y: existingPos.y },
          angleDegrees: existingPos.angle,
          fovDegrees: existingPos.fov,
          status: 'online',
        });
      }
    });

    // Overall appearance from representative embedding
    const overallAppearance = this.featureExtractor.analyzeAppearanceSignature(
      identity.representative_embedding
    );

    // Build breadcrumb waypoints
    const waypoints: BreadcrumbWaypoint[] = targetSightings.map((s, index) => {
      const coords = posMap.get(s.camera_id) || getDefaultCoordinatesForLocation(undefined, s.camera_name, index);
      const prevSighting = index > 0 ? targetSightings[index - 1] : undefined;
      const transitFromPrev = prevSighting
        ? Math.max(0, (s.entered_at.getTime() - prevSighting.exited_at.getTime()) / 1000)
        : undefined;

      const appearance = this.featureExtractor.analyzeAppearanceSignature(
        s.embedding,
        s.bounding_box
      );

      const isCurrentLocation = index === targetSightings.length - 1;

      return {
        stepIndex: index + 1,
        cameraId: s.camera_id,
        cameraName: s.camera_name || `Camera ${s.camera_id.slice(0, 8)}`,
        zoneName: coords.zoneName,
        floorLevel,
        coordinates: { x: coords.x, y: coords.y },
        enteredAt: s.entered_at.toISOString(),
        exitedAt: s.exited_at.toISOString(),
        dwellSeconds: s.dwell_seconds,
        transitFromPreviousSeconds: transitFromPrev,
        confidence: s.confidence,
        qualityScore: s.quality_score,
        snapshotUrl: s.snapshot_url,
        boundingBox: s.bounding_box,
        appearance,
        isCurrentLocation,
      };
    });

    // Build route segments connecting successive cameras
    const routeSegments: BreadcrumbSegment[] = [];
    for (let i = 0; i < targetSightings.length - 1; i++) {
      const from = targetSightings[i]!;
      const to = targetSightings[i + 1]!;
      const fromCoords = posMap.get(from.camera_id) || { x: 10, y: 50 };
      const toCoords = posMap.get(to.camera_id) || { x: 90, y: 50 };

      const transitMs = to.entered_at.getTime() - from.exited_at.getTime();
      const transitDurationSeconds = Math.max(0, transitMs / 1000.0);

      // Distance estimation based on 2D coordinates (assuming a 40m x 30m typical branch footprint)
      const dx = (toCoords.x - fromCoords.x) * 0.40;
      const dy = (toCoords.y - fromCoords.y) * 0.30;
      const distanceMeters = Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10;
      const velocityMps = transitDurationSeconds > 0
        ? Math.round((distanceMeters / transitDurationSeconds) * 100) / 100
        : undefined;

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

      routeSegments.push({
        fromCameraId: from.camera_id,
        fromCameraName: from.camera_name || `Camera ${from.camera_id.slice(0, 8)}`,
        toCameraId: to.camera_id,
        toCameraName: to.camera_name || `Camera ${to.camera_id.slice(0, 8)}`,
        fromCoordinates: { x: fromCoords.x, y: fromCoords.y },
        toCoordinates: { x: toCoords.x, y: toCoords.y },
        transitDurationSeconds,
        departedAt: from.exited_at.toISOString(),
        arrivedAt: to.entered_at.toISOString(),
        isPlausible: validation.isFeasible,
        distanceMeters,
        velocityMps,
      });
    }

    const firstSeen = targetSightings[0]!.entered_at;
    const lastSeen = targetSightings[targetSightings.length - 1]!.exited_at;
    const journeySpanSeconds = Math.max(0, (lastSeen.getTime() - firstSeen.getTime()) / 1000);
    const totalDwellSeconds = targetSightings.reduce((acc, s) => acc + s.dwell_seconds, 0);
    const uniqueCameras = new Set(targetSightings.map((s) => s.camera_id));

    const now = Date.now();
    const timeSinceLastSeen = (now - lastSeen.getTime()) / 1000;
    const isLiveActive = timeSinceLastSeen < 300; // seen within last 5 minutes

    const lastWaypoint = waypoints[waypoints.length - 1]!;

    return {
      globalId,
      identity,
      branchId: effectiveBranchId,
      floorLevel,
      totalSightings: targetSightings.length,
      uniqueCamerasCount: uniqueCameras.size,
      firstSeen: firstSeen.toISOString(),
      lastSeen: lastSeen.toISOString(),
      totalDwellSeconds,
      journeySpanSeconds,
      isLiveActive,
      currentCameraId: lastWaypoint.cameraId,
      currentCameraName: lastWaypoint.cameraName,
      currentCoordinates: lastWaypoint.coordinates,
      overallAppearance,
      waypoints,
      routeSegments,
      allBranchCameras,
    };
  }

  /**
   * Get 2D floor plan layout and all registered cameras for a branch
   */
  public async getBranchFloorPlan(
    tenantId: string,
    branchId: string,
    floorLevel: string = 'ground'
  ): Promise<{
    branchId: string;
    floorLevel: string;
    cameras: Array<{
      cameraId: string;
      cameraName: string;
      locationType?: string;
      zoneName: string;
      coordinates: { x: number; y: number };
      angleDegrees: number;
      fovDegrees: number;
      status: string;
    }>;
  }> {
    const [savedPositions, branchCameras] = await Promise.all([
      this.repository.getCameraFloorPositions(tenantId, branchId, floorLevel),
      this.repository.getBranchCameras(tenantId, branchId),
    ]);

    const posMap = new Map<string, { x: number; y: number; zoneName: string; angle: number; fov: number }>();
    savedPositions.forEach((p) => {
      posMap.set(p.camera_id, {
        x: p.position_x,
        y: p.position_y,
        zoneName: p.zone_name || getDefaultCoordinatesForLocation(p.location_type, p.camera_name).zoneName,
        angle: p.angle_degrees,
        fov: p.fov_degrees,
      });
    });

    const cameras = branchCameras.map((cam, idx) => {
      const existing = posMap.get(cam.id);
      if (existing) {
        return {
          cameraId: cam.id,
          cameraName: cam.name,
          locationType: cam.locationType,
          zoneName: existing.zoneName,
          coordinates: { x: existing.x, y: existing.y },
          angleDegrees: existing.angle,
          fovDegrees: existing.fov,
          status: cam.status,
        };
      }
      const def = getDefaultCoordinatesForLocation(cam.locationType, cam.name, idx);
      return {
        cameraId: cam.id,
        cameraName: cam.name,
        locationType: cam.locationType,
        zoneName: def.zoneName,
        coordinates: { x: def.x, y: def.y },
        angleDegrees: def.angle,
        fovDegrees: 75,
        status: cam.status,
      };
    });

    return { branchId, floorLevel, cameras };
  }

  /**
   * Calibrate / update 2D floor plan coordinates for a camera
   */
  public async updateCameraFloorPosition(
    tenantId: string,
    pos: {
      branchId?: string | null;
      cameraId: string;
      positionX: number;
      positionY: number;
      floorLevel?: string;
      zoneName?: string | null;
      angleDegrees?: number;
      fovDegrees?: number;
    }
  ) {
    return this.repository.upsertCameraFloorPosition(tenantId, pos);
  }

  /**
   * One-Click "Follow This Target" Re-ID Action:
   * Operator clicks a suspect in camera footage/snapshot. The engine extracts appearance features,
   * matches across all branch cameras, reconstructs their 2D breadcrumb trail, and returns the route map.
   */
  public async followTarget(input: FollowTargetInput): Promise<FollowTargetResult> {
    let embedding: number[];
    if (input.cropRgb) {
      embedding = this.featureExtractor.extractFromRgbBuffer(
        input.cropRgb.buffer,
        input.cropRgb.width,
        input.cropRgb.height,
        input.cropRgb.channels ?? 3
      );
    } else if (input.cropBase64 && input.boundingBox) {
      const buf = Buffer.from(input.cropBase64, 'base64');
      const w = Math.max(10, Math.round(input.boundingBox.width));
      const h = Math.max(10, Math.round(input.boundingBox.height));
      embedding = this.featureExtractor.extractFromRgbBuffer(new Uint8Array(buf), w, h, 3);
    } else if (input.embedding) {
      embedding = ReidFeatureExtractor.normalizeL2(input.embedding);
    } else {
      throw new Error('Follow target requires either embedding vector, cropBase64, or cropRgb buffer');
    }

    const appearance = this.featureExtractor.analyzeAppearanceSignature(embedding, input.boundingBox);

    // Ingest or match against existing target identities
    const now = new Date();
    const ingestResult = await this.ingestSighting({
      tenantId: input.tenantId,
      branchId: input.branchId,
      cameraId: input.cameraId,
      localTrackId: `manual_follow_${Date.now()}`,
      enteredAt: new Date(now.getTime() - 10000),
      exitedAt: now,
      embedding,
      confidence: input.confidence ?? 0.92,
      boundingBox: input.boundingBox || { x: 20, y: 20, width: 60, height: 120 },
      snapshotUrl: input.snapshotUrl,
      similarityThreshold: input.similarityThreshold ?? 0.68,
    });

    const routeMap = await this.getFloorPlanTrail(
      ingestResult.globalId,
      input.tenantId,
      input.branchId
    );

    if (!routeMap) {
      throw new Error(`Failed to reconstruct floor plan trail for target ${ingestResult.globalId}`);
    }

    // Format human-readable movement path (e.g. Cam 1 ➡️ Cam 3 ➡️ Vault Cam 5)
    const cameraChain = routeMap.waypoints
      .map((w) => w.cameraName)
      .filter((v, i, arr) => i === 0 || v !== arr[i - 1])
      .join(' ➡️ ');

    const actionSummary = `Tracking Target [${ingestResult.globalId}]: ${appearance.clothingDescription}. Route: ${cameraChain}`;

    return {
      globalId: ingestResult.globalId,
      isNewIdentity: ingestResult.isNewIdentity,
      matched: ingestResult.matched,
      similarity: ingestResult.similarity,
      routeMap,
      appearance,
      actionSummary,
    };
  }
}

function getDefaultCoordinatesForLocation(
  locationType?: string,
  cameraName: string = '',
  index: number = 0
): { x: number; y: number; zoneName: string; angle: number } {
  const normLoc = (locationType || '').toLowerCase();
  const normName = cameraName.toLowerCase();

  if (normLoc.includes('entrance') || normName.includes('entrance') || normName.includes('gate') || normName.includes('entry')) {
    return { x: 12, y: 52, zoneName: 'Main Entrance & Vestibule', angle: 45 };
  }
  if (normLoc.includes('atm') || normName.includes('atm')) {
    return { x: 12, y: 22, zoneName: '24/7 ATM Lobby', angle: 90 };
  }
  if (normLoc.includes('lobby') || normLoc.includes('waiting') || normName.includes('lobby') || normName.includes('hall')) {
    return { x: 35, y: 50, zoneName: 'Customer Banking Hall', angle: 0 };
  }
  if (normLoc.includes('cash') || normLoc.includes('teller') || normName.includes('cash') || normName.includes('counter')) {
    return { x: 58, y: 36, zoneName: 'Cash & Teller Counters', angle: 315 };
  }
  if (normLoc.includes('corridor') || normName.includes('corridor') || normName.includes('passage')) {
    return { x: 74, y: 62, zoneName: 'Vault Interlock Corridor', angle: 0 };
  }
  if (
    normLoc.includes('vault') ||
    normLoc.includes('strong-room') ||
    normLoc.includes('safe') ||
    normLoc.includes('locker') ||
    normName.includes('vault') ||
    normName.includes('strong')
  ) {
    return { x: 88, y: 62, zoneName: 'Strong Room & Main Vault', angle: 270 };
  }
  if (normLoc.includes('manager') || normLoc.includes('cabin') || normName.includes('manager') || normName.includes('cabin')) {
    return { x: 58, y: 78, zoneName: 'Branch Manager Cabin', angle: 225 };
  }
  if (normLoc.includes('server') || normName.includes('server') || normName.includes('rack') || normName.includes('it')) {
    return { x: 88, y: 22, zoneName: 'Server & UPS Room', angle: 180 };
  }
  if (normLoc.includes('exit') || normName.includes('exit') || normName.includes('emergency')) {
    return { x: 35, y: 85, zoneName: 'Rear Emergency Exit', angle: 270 };
  }

  const slots = [
    { x: 18, y: 40, zoneName: 'Front Service Desk', angle: 45 },
    { x: 45, y: 60, zoneName: 'Customer Waiting Lounge', angle: 0 },
    { x: 70, y: 40, zoneName: 'Document & Loan Section', angle: 315 },
    { x: 82, y: 78, zoneName: 'Staff Back Office', angle: 225 },
  ];
  const slot = slots[index % slots.length]!;
  return { ...slot, zoneName: `${slot.zoneName} (${index + 1})` };
}

export interface BreadcrumbWaypoint {
  stepIndex: number;
  cameraId: string;
  cameraName: string;
  locationType?: string;
  zoneName: string;
  floorLevel: string;
  coordinates: { x: number; y: number };
  enteredAt: string;
  exitedAt: string;
  dwellSeconds: number;
  transitFromPreviousSeconds?: number;
  confidence: number;
  qualityScore: number;
  snapshotUrl: string | null;
  boundingBox: BoundingBox;
  appearance: AppearanceSignature;
  isCurrentLocation: boolean;
}

export interface BreadcrumbSegment {
  fromCameraId: string;
  fromCameraName: string;
  toCameraId: string;
  toCameraName: string;
  fromCoordinates: { x: number; y: number };
  toCoordinates: { x: number; y: number };
  transitDurationSeconds: number;
  departedAt: string;
  arrivedAt: string;
  isPlausible: boolean;
  distanceMeters?: number;
  velocityMps?: number;
}

export interface FloorPlanRouteMap {
  globalId: string;
  identity: ReidGlobalIdentity;
  branchId?: string;
  floorLevel: string;
  totalSightings: number;
  uniqueCamerasCount: number;
  firstSeen: string;
  lastSeen: string;
  totalDwellSeconds: number;
  journeySpanSeconds: number;
  isLiveActive: boolean;
  currentCameraId?: string;
  currentCameraName?: string;
  currentCoordinates?: { x: number; y: number };
  overallAppearance: AppearanceSignature;
  waypoints: BreadcrumbWaypoint[];
  routeSegments: BreadcrumbSegment[];
  allBranchCameras: Array<{
    cameraId: string;
    cameraName: string;
    locationType?: string;
    zoneName: string;
    coordinates: { x: number; y: number };
    angleDegrees: number;
    fovDegrees: number;
    status: string;
  }>;
}

export interface FollowTargetInput {
  tenantId: string;
  branchId?: string;
  cameraId: string;
  cropBase64?: string;
  cropRgb?: { buffer: Uint8Array; width: number; height: number; channels?: 3 | 4 };
  embedding?: number[];
  boundingBox?: BoundingBox;
  confidence?: number;
  snapshotUrl?: string;
  similarityThreshold?: number;
}

export interface FollowTargetResult {
  globalId: string;
  isNewIdentity: boolean;
  matched: boolean;
  similarity: number;
  routeMap: FloorPlanRouteMap;
  appearance: AppearanceSignature;
  actionSummary: string;
}
