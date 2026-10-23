/**
 * Face Recognition Integration Service
 * Connects face detection pipeline with governance, enrollment, and alerting
 * Implements temporal confirmation and BFSI compliance workflows
 */

import type { Pool } from "pg";
import type { FaceRecognitionService } from "./face-recognition.service.js";
import type { FaceSearchService } from "./face-search.service.js";
import type { FaceRecognitionGovernanceService } from "../../../src/banking/governance/face-recognition-governance.service.js";
import { FACE_MATCH_MINIMUM, FACE_MATCH_MARGIN, validFaceVector, selectFaceIdentity } from "../../../packages/contracts/src/face-match-policy.js";

export interface FaceDetectionInput {
  tenantId: string;
  cameraId: string;
  branchId?: string;
  faceId: string; // Track ID
  boundingBox: { x: number; y: number; width: number; height: number };
  confidence: number;
  timestamp: Date;
  imageBuffer?: Buffer;
  embedding?: Float32Array;
  quality?: number;
  liveness?: number;
}

export interface TemporalConfirmation {
  faceId: string;
  cameraId: string;
  personId: string | null;
  observations: Array<{
    timestamp: Date;
    confidence: number;
    similarity?: number;
    liveness?: number;
  }>;
  firstSeen: Date;
  lastSeen: Date;
  observationCount: number;
  confirmed: boolean;
}

export interface FaceRecognitionResult {
  matched: boolean;
  personId?: string;
  personName?: string;
  watchlistId?: string;
  watchlistName?: string;
  similarity?: number;
  confidence?: number;
  needsReview: boolean;
  alertGenerated: boolean;
  temporalConfirmation?: TemporalConfirmation;
  governanceResult?: {
    accepted: boolean;
    reason?: string;
  };
}

/**
 * Face Recognition Integration Service
 *
 * Responsibilities:
 * 1. Temporal confirmation tracking across frames
 * 2. Watchlist matching with governance validation
 * 3. Alert generation for confirmed matches
 * 4. Human review queue management
 * 5. BFSI compliance enforcement
 */
export class FaceRecognitionIntegrationService {
  // Temporal confirmation tracking
  private readonly temporalTracks = new Map<string, TemporalConfirmation>();
  private readonly TEMPORAL_WINDOW_MS = 10000; // 10 second window (increased from 5s)
  private readonly CLEANUP_INTERVAL_MS = 60000; // Cleanup every minute

  // Alert cooldown tracking to prevent spam
  private readonly ALERT_COOLDOWN_MS = 300000; // 5 minutes cooldown
  private readonly alertCooldowns = new Map<string, number>(); // personId -> lastAlertTime

  constructor(
    private readonly db: Pool,
    private readonly recognitionService: FaceRecognitionService,
    private readonly searchService: FaceSearchService,
    private readonly governanceService: FaceRecognitionGovernanceService,
  ) {
    // Start periodic cleanup of stale temporal tracks
    setInterval(() => this.cleanupStaleTracks(), this.CLEANUP_INTERVAL_MS).unref();
  }

  /**
   * Process a face detection from the live stream
   * Implements full BFSI compliance workflow with temporal confirmation
   */
  async processFaceDetection(input: FaceDetectionInput): Promise<FaceRecognitionResult> {
    const trackKey = `${input.tenantId}:${input.cameraId}:${input.faceId}`;

    // Get or create temporal confirmation track
    let track = this.temporalTracks.get(trackKey);
    if (!track) {
      track = {
        faceId: input.faceId,
        cameraId: input.cameraId,
        personId: null,
        observations: [],
        firstSeen: input.timestamp,
        lastSeen: input.timestamp,
        observationCount: 0,
        confirmed: false,
      };
      this.temporalTracks.set(trackKey, track);
    }

    const resetTrack = () => { track!.observations=[];track!.observationCount=0;track!.confirmed=false;track!.personId=null; };

    // Raw image bytes are not an aligned face embedding. Require the upstream
    // recognition pipeline to supply a verified embedding; fail closed here.
    const embedding = input.embedding;
    if (!embedding || !validFaceVector(Array.from(embedding))) {
      resetTrack();
      return {
        matched: false,
        needsReview: false,
        alertGenerated: false,
        temporalConfirmation: track,
      };
    }

    // Search for matches in watchlists
    const candidates = await this.searchService.searchPersons({
      tenantId: input.tenantId,
      embedding,
      threshold: 0.60, // Review threshold
      limit: 50,
    });

    if (candidates.length === 0) {
      resetTrack();
      return {
        matched: false,
        needsReview: false,
        alertGenerated: false,
        temporalConfirmation: track,
      };
    }

    const bestMatch = candidates[0];

    // Get watchlist configuration for thresholds
    const watchlist = await this.getWatchlistConfig(bestMatch.watchlistId,input.tenantId);
    if (!watchlist) {
      resetTrack();
      return {
        matched: false,
        needsReview: false,
        alertGenerated: false,
        temporalConfirmation: track,
      };
    }

    const matchThreshold = Math.max(FACE_MATCH_MINIMUM,Number(watchlist.match_threshold ?? FACE_MATCH_MINIMUM));
    const reviewThreshold = Number(watchlist.review_threshold ?? 0.65);
    const temporalFramesRequired = Math.max(2,Number(watchlist.temporal_confirmation_frames ?? 3));
    const margin = Math.max(FACE_MATCH_MARGIN,Number(watchlist.minimum_margin ?? FACE_MATCH_MARGIN));
    const minimumQuality = Number(watchlist.minimum_quality ?? 0.55);

    // Determine if match is definitive or needs review
    const chosen = selectFaceIdentity(candidates,row=>row.personId,row=>row.bestSimilarity,matchThreshold,margin);
    const qualityAccepted = Number.isFinite(input.quality) && input.quality! >= minimumQuality;
    const isDefinitiveMatch = Boolean(chosen) && qualityAccepted;
    const needsReview = !isDefinitiveMatch && bestMatch.bestSimilarity >= reviewThreshold;
    if (!isDefinitiveMatch) {
      resetTrack();
      return {matched:false,needsReview,alertGenerated:false,temporalConfirmation:track};
    }
    const windowMs = Math.max(1,Number(watchlist.temporal_window_seconds ?? 2))*1000;
    const timestamp = input.timestamp.getTime();
    if (!Number.isFinite(timestamp)) {resetTrack();return {matched:false,needsReview:false,alertGenerated:false};}
    if (track.observationCount > 0 && timestamp <= track.lastSeen.getTime()) return {matched:false,needsReview:true,alertGenerated:false};
    if (track.personId !== bestMatch.personId) resetTrack();
    track.personId = bestMatch.personId;
    track.observations=track.observations.filter(item=>timestamp-item.timestamp.getTime()>=0 && timestamp-item.timestamp.getTime()<=windowMs);
    const previous=track.observations.at(-1)?.timestamp.getTime();
    if (previous !== undefined && timestamp <= previous) return {matched:false,needsReview:true,alertGenerated:false};
    track.observations.push({timestamp:input.timestamp,confidence:input.confidence,similarity:bestMatch.bestSimilarity,liveness:input.liveness});
    track.lastSeen=input.timestamp;
    track.observationCount=track.observations.length;

    // Check temporal confirmation
    const hasTemporalConfirmation = track.observationCount >= temporalFramesRequired;
    track.confirmed = hasTemporalConfirmation && isDefinitiveMatch;

    // If not enough observations, don't trigger alert yet
    if (!hasTemporalConfirmation) {
      return {
        matched: false,
        similarity: bestMatch.bestSimilarity,
        confidence: bestMatch.bestSimilarity,
        needsReview: true,
        alertGenerated: false,
        temporalConfirmation: track,
      };
    }

    // Check alert cooldown to prevent spam
    const personKey = `${input.tenantId}:${bestMatch.personId}`;
    const lastAlert = this.alertCooldowns.get(personKey);
    const now = Date.now();

    // Temporal confirmation achieved - validate with governance
    const branchId = input.branchId || await this.getCameraBranchId(input.cameraId, input.tenantId);

    const governanceValidation = this.governanceService.validateBiometricObservation({
      cameraId: input.cameraId,
      branchId: branchId || "default",
      tenantId: input.tenantId,
      embedding: Array.from(embedding),
      livenessScore: input.liveness || 0.0,
      observationCount: track.observationCount,
      observedAt: input.timestamp,
      matchedPersonId: bestMatch.personId,
      isWatchlistMatch: true,
    });

    // Log governance audit
    await this.logGovernanceAudit({
      tenantId: input.tenantId,
      cameraId: input.cameraId,
      branchId: branchId || "default",
      personId: bestMatch.personId,
      validationResult: governanceValidation.accepted ? "ACCEPTED" : "REJECTED",
      rejectionReason: governanceValidation.reason,
      livenessScore: input.liveness,
      qualityScore: input.quality,
      observationCount: track.observationCount,
      occurredAt: input.timestamp,
    });

    if (!governanceValidation.accepted) {
      resetTrack();
      return {matched:false,needsReview:true,alertGenerated:false,temporalConfirmation:track,governanceResult:governanceValidation};
    }

    if (lastAlert && (now - lastAlert) < this.ALERT_COOLDOWN_MS) {
      // Person was alerted recently - suppress alert but maintain tracking
      return {
        matched: true,
        personId: bestMatch.personId,
        personName: bestMatch.displayName,
        watchlistId: bestMatch.watchlistId,
        watchlistName: bestMatch.watchlistName,
        similarity: bestMatch.bestSimilarity,
        confidence: bestMatch.bestSimilarity,
        needsReview: false,
        alertGenerated: false, // Suppressed due to cooldown
        temporalConfirmation: track,
        governanceResult: {
          accepted: false,
          reason: `Alert cooldown active (${Math.round((this.ALERT_COOLDOWN_MS - (now - lastAlert)) / 60000)} minutes remaining)`,
        },
      };
    }


    // Create face recognition event
    const eventId = await this.createRecognitionEvent({
      tenantId: input.tenantId,
      cameraId: input.cameraId,
      watchlistId: bestMatch.watchlistId,
      personId: bestMatch.personId,
      similarityScore: bestMatch.bestSimilarity,
      faceBbox: input.boundingBox,
      faceQuality: input.quality,
      occurredAt: input.timestamp,
    });

    // Determine if human review is required
    const requiresHumanReview = watchlist.alert_severity === "P1" ||
                                watchlist.alert_severity === "P2" ||
                                needsReview;

    if (requiresHumanReview) {
      await this.queueHumanReview({
        reviewId: eventId,
        incidentType: "WATCHLIST_MATCH",
        cameraId: input.cameraId,
        branchId: branchId || "default",
        detectedAt: input.timestamp,
        confidence: bestMatch.bestSimilarity,
      });
    }

    // Alert should be generated
    const alertGenerated = track.confirmed && governanceValidation.accepted;

    // Record cooldown timestamp if alert was generated
    if (alertGenerated) {
      this.alertCooldowns.set(personKey, now);
    }

    return {
      matched: isDefinitiveMatch,
      personId: bestMatch.personId,
      personName: bestMatch.displayName,
      watchlistId: bestMatch.watchlistId,
      watchlistName: bestMatch.watchlistName,
      similarity: bestMatch.bestSimilarity,
      confidence: bestMatch.bestSimilarity,
      needsReview: requiresHumanReview,
      alertGenerated,
      temporalConfirmation: track,
      governanceResult: governanceValidation,
    };
  }

  /**
   * Get watchlist configuration
   */
  private async getWatchlistConfig(watchlistId: string,tenantId:string): Promise<any> {
    try {
      const result = await this.db.query(
        `SELECT * FROM face_watchlists WHERE id = $1 AND tenant_id = $2 AND enabled = true AND archived_at IS NULL`,
        [watchlistId,tenantId]
      );
      return result.rows[0] || null;
    } catch (err) {
      console.error("Failed to fetch watchlist config:", err);
      return null;
    }
  }

  /**
   * Get camera branch ID
   */
  private async getCameraBranchId(cameraId: string, tenantId: string): Promise<string | null> {
    try {
      const result = await this.db.query(
        `SELECT branch_id FROM cameras WHERE id = $1 AND tenant_id = $2`,
        [cameraId, tenantId]
      );
      return result.rows[0]?.branch_id || null;
    } catch (err) {
      console.error("Failed to fetch camera branch:", err);
      return null;
    }
  }

  /**
   * Create face recognition event in database
   */
  private async createRecognitionEvent(event: {
    tenantId: string;
    cameraId: string;
    watchlistId: string;
    personId: string;
    similarityScore: number;
    faceBbox: { x: number; y: number; width: number; height: number };
    faceQuality?: number;
    occurredAt: Date;
  }): Promise<string> {
    const result = await this.db.query(
      `
      INSERT INTO face_recognition_events (
        tenant_id, camera_id, watchlist_id, person_id,
        similarity_score, face_bbox, face_quality, occurred_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
      `,
      [
        event.tenantId,
        event.cameraId,
        event.watchlistId,
        event.personId,
        event.similarityScore,
        JSON.stringify(event.faceBbox),
        event.faceQuality || null,
        event.occurredAt,
      ]
    );

    // Update person last_seen_at and match_count
    await this.db.query(
      `
      UPDATE face_watchlist_persons
      SET last_seen_at = $1, match_count = match_count + 1
      WHERE id = $2
      `,
      [event.occurredAt, event.personId]
    );

    return result.rows[0].id;
  }

  /**
   * Queue human review task
   */
  private async queueHumanReview(task: {
    reviewId: string;
    incidentType: "WATCHLIST_MATCH" | "WEAPON_DETECTED" | "HOSTAGE_POSTURE";
    cameraId: string;
    branchId: string;
    detectedAt: Date;
    confidence: number;
  }): Promise<void> {
    this.governanceService.queueHumanReview(task);
  }

  /**
   * Log governance audit trail
   */
  private async logGovernanceAudit(audit: {
    tenantId: string;
    cameraId: string;
    branchId: string;
    personId: string;
    validationResult: "ACCEPTED" | "REJECTED" | "PENDING_REVIEW";
    rejectionReason?: string;
    livenessScore?: number;
    qualityScore?: number;
    observationCount: number;
    occurredAt: Date;
  }): Promise<void> {
    try {
      await this.db.query(
        `
        INSERT INTO face_governance_audit (
          tenant_id, camera_id, branch_id, person_id,
          validation_result, rejection_reason,
          liveness_score, quality_score, observation_count, occurred_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          audit.tenantId,
          audit.cameraId,
          audit.branchId,
          audit.personId,
          audit.validationResult,
          audit.rejectionReason || null,
          audit.livenessScore || null,
          audit.qualityScore || null,
          audit.observationCount,
          audit.occurredAt,
        ]
      );
    } catch (err) {
      console.error("Failed to log governance audit:", err);
    }
  }

  /**
   * Cleanup stale temporal tracks and old cooldowns
   */
  private cleanupStaleTracks(): void {
    const now = Date.now();
    const staleThreshold = now - this.TEMPORAL_WINDOW_MS * 3; // 30 seconds (increased from 10s)

    // Cleanup stale tracks
    for (const [key, track] of this.temporalTracks.entries()) {
      if (track.lastSeen.getTime() < staleThreshold) {
        this.temporalTracks.delete(key);
      }
    }

    // Cleanup expired cooldowns (after 2x cooldown period)
    for (const [key, timestamp] of this.alertCooldowns.entries()) {
      if (now - timestamp > this.ALERT_COOLDOWN_MS * 2) {
        this.alertCooldowns.delete(key);
      }
    }
  }

  /**
   * Get active temporal tracks (for monitoring/debugging)
   */
  getActiveTemporalTracks(): TemporalConfirmation[] {
    return Array.from(this.temporalTracks.values());
  }

  /**
   * Clear all temporal tracks (for testing)
   */
  clearAllTemporalTracks(): void {
    this.temporalTracks.clear();
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    activeTracksCount: number;
    confirmedTracksCount: number;
    averageObservationCount: number;
  } {
    const tracks = Array.from(this.temporalTracks.values());
    const confirmedTracks = tracks.filter(t => t.confirmed);
    const avgObservations = tracks.length > 0
      ? tracks.reduce((sum, t) => sum + t.observationCount, 0) / tracks.length
      : 0;

    return {
      activeTracksCount: tracks.length,
      confirmedTracksCount: confirmedTracks.length,
      averageObservationCount: Math.round(avgObservations * 10) / 10,
    };
  }
}
