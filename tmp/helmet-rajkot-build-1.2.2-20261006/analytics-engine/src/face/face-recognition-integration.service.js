/**
 * Face Recognition Integration Service
 * Connects face detection pipeline with governance, enrollment, and alerting
 * Implements temporal confirmation and BFSI compliance workflows
 */
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
    db;
    recognitionService;
    searchService;
    governanceService;
    // Temporal confirmation tracking
    temporalTracks = new Map();
    TEMPORAL_WINDOW_MS = 5000; // 5 second window
    CLEANUP_INTERVAL_MS = 60000; // Cleanup every minute
    constructor(db, recognitionService, searchService, governanceService) {
        this.db = db;
        this.recognitionService = recognitionService;
        this.searchService = searchService;
        this.governanceService = governanceService;
        // Start periodic cleanup of stale temporal tracks
        setInterval(() => this.cleanupStaleTracks(), this.CLEANUP_INTERVAL_MS);
    }
    /**
     * Process a face detection from the live stream
     * Implements full BFSI compliance workflow with temporal confirmation
     */
    async processFaceDetection(input) {
        const trackKey = `${input.cameraId}:${input.faceId}`;
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
        // Update temporal track
        track.lastSeen = input.timestamp;
        track.observations.push({
            timestamp: input.timestamp,
            confidence: input.confidence,
            liveness: input.liveness,
        });
        track.observationCount = track.observations.length;
        // Raw image bytes are not an aligned face embedding. Require the upstream
        // recognition pipeline to supply a verified embedding; fail closed here.
        const embedding = input.embedding;
        if (!embedding) {
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
            limit: 10,
        });
        if (candidates.length === 0) {
            return {
                matched: false,
                needsReview: false,
                alertGenerated: false,
                temporalConfirmation: track,
            };
        }
        const bestMatch = candidates[0];
        track.personId = bestMatch.personId;
        // Update observation with similarity
        track.observations[track.observations.length - 1].similarity = bestMatch.bestSimilarity;
        // Get watchlist configuration for thresholds
        const watchlist = await this.getWatchlistConfig(bestMatch.watchlistId);
        if (!watchlist) {
            return {
                matched: false,
                needsReview: false,
                alertGenerated: false,
                temporalConfirmation: track,
            };
        }
        const matchThreshold = watchlist.match_threshold || 0.70;
        const reviewThreshold = watchlist.review_threshold || 0.60;
        const temporalFramesRequired = watchlist.temporal_confirmation_frames || 3;
        // Determine if match is definitive or needs review
        const isDefinitiveMatch = bestMatch.bestSimilarity >= matchThreshold;
        const needsReview = bestMatch.bestSimilarity >= reviewThreshold && bestMatch.bestSimilarity < matchThreshold;
        // Check temporal confirmation
        const hasTemporalConfirmation = track.observationCount >= temporalFramesRequired;
        track.confirmed = hasTemporalConfirmation && isDefinitiveMatch;
        // If not enough observations, don't trigger alert yet
        if (!hasTemporalConfirmation) {
            return {
                matched: isDefinitiveMatch,
                personId: bestMatch.personId,
                personName: bestMatch.displayName,
                watchlistId: bestMatch.watchlistId,
                watchlistName: bestMatch.watchlistName,
                similarity: bestMatch.bestSimilarity,
                confidence: bestMatch.supportingEmbeddings,
                needsReview,
                alertGenerated: false,
                temporalConfirmation: track,
            };
        }
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
            return {
                matched: isDefinitiveMatch,
                personId: bestMatch.personId,
                personName: bestMatch.displayName,
                watchlistId: bestMatch.watchlistId,
                watchlistName: bestMatch.watchlistName,
                similarity: bestMatch.bestSimilarity,
                confidence: bestMatch.supportingEmbeddings,
                needsReview,
                alertGenerated: false,
                temporalConfirmation: track,
                governanceResult: governanceValidation,
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
        return {
            matched: isDefinitiveMatch,
            personId: bestMatch.personId,
            personName: bestMatch.displayName,
            watchlistId: bestMatch.watchlistId,
            watchlistName: bestMatch.watchlistName,
            similarity: bestMatch.bestSimilarity,
            confidence: bestMatch.supportingEmbeddings,
            needsReview: requiresHumanReview,
            alertGenerated,
            temporalConfirmation: track,
            governanceResult: governanceValidation,
        };
    }
    /**
     * Get watchlist configuration
     */
    async getWatchlistConfig(watchlistId) {
        try {
            const result = await this.db.query(`SELECT * FROM face_watchlists WHERE id = $1 AND archived_at IS NULL`, [watchlistId]);
            return result.rows[0] || null;
        }
        catch (err) {
            console.error("Failed to fetch watchlist config:", err);
            return null;
        }
    }
    /**
     * Get camera branch ID
     */
    async getCameraBranchId(cameraId, tenantId) {
        try {
            const result = await this.db.query(`SELECT branch_id FROM cameras WHERE id = $1 AND tenant_id = $2`, [cameraId, tenantId]);
            return result.rows[0]?.branch_id || null;
        }
        catch (err) {
            console.error("Failed to fetch camera branch:", err);
            return null;
        }
    }
    /**
     * Create face recognition event in database
     */
    async createRecognitionEvent(event) {
        const result = await this.db.query(`
      INSERT INTO face_recognition_events (
        tenant_id, camera_id, watchlist_id, person_id,
        similarity_score, face_bbox, face_quality, occurred_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
      `, [
            event.tenantId,
            event.cameraId,
            event.watchlistId,
            event.personId,
            event.similarityScore,
            JSON.stringify(event.faceBbox),
            event.faceQuality || null,
            event.occurredAt,
        ]);
        // Update person last_seen_at and match_count
        await this.db.query(`
      UPDATE face_watchlist_persons 
      SET last_seen_at = $1, match_count = match_count + 1
      WHERE id = $2
      `, [event.occurredAt, event.personId]);
        return result.rows[0].id;
    }
    /**
     * Queue human review task
     */
    async queueHumanReview(task) {
        this.governanceService.queueHumanReview(task);
    }
    /**
     * Log governance audit trail
     */
    async logGovernanceAudit(audit) {
        try {
            await this.db.query(`
        INSERT INTO face_governance_audit (
          tenant_id, camera_id, branch_id, person_id,
          validation_result, rejection_reason,
          liveness_score, quality_score, observation_count, occurred_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
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
            ]);
        }
        catch (err) {
            console.error("Failed to log governance audit:", err);
        }
    }
    /**
     * Cleanup stale temporal tracks
     */
    cleanupStaleTracks() {
        const now = Date.now();
        const staleThreshold = now - this.TEMPORAL_WINDOW_MS * 2; // 10 seconds
        for (const [key, track] of this.temporalTracks.entries()) {
            if (track.lastSeen.getTime() < staleThreshold) {
                this.temporalTracks.delete(key);
            }
        }
    }
    /**
     * Get active temporal tracks (for monitoring/debugging)
     */
    getActiveTemporalTracks() {
        return Array.from(this.temporalTracks.values());
    }
    /**
     * Clear all temporal tracks (for testing)
     */
    clearAllTemporalTracks() {
        this.temporalTracks.clear();
    }
    /**
     * Get statistics
     */
    getStatistics() {
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
