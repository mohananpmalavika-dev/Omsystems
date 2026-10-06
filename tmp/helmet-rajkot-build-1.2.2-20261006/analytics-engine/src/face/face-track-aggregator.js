/**
 * Face Track Aggregator
 * Aggregates face observations across frames for temporal confirmation
 */
export class FaceTrackAggregator {
    db;
    config;
    activeTracks = new Map();
    cleanupTimer = null;
    constructor(db, config) {
        this.db = db;
        this.config = {
            trackExpirationSeconds: 10,
            cleanupIntervalSeconds: 5,
            minObservationsForAlert: 3,
            temporalWindowSeconds: 2,
            ...config,
        };
    }
    /**
     * Start background cleanup
     */
    start() {
        if (this.cleanupTimer)
            return;
        this.cleanupTimer = setInterval(() => {
            this.cleanupExpiredTracks();
        }, this.config.cleanupIntervalSeconds * 1000);
    }
    /**
     * Stop background cleanup
     */
    stop() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }
    /**
     * Add face observation to track
     */
    async addObservation(observation, watchlistConfig) {
        const trackId = observation.trackId || this.generateTrackId(observation);
        // Get or create track
        let track = this.activeTracks.get(trackId);
        if (!track) {
            track = this.createTrack(trackId, observation);
            this.activeTracks.set(trackId, track);
        }
        // Add observation
        track.observations.push(observation);
        track.lastSeenAt = observation.timestamp;
        // Update identity evidence
        if (observation.recognition?.status === 'MATCH') {
            const match = observation.recognition;
            this.updateIdentityEvidence(track, match.personId, match.displayName, match.watchlistId, observation);
        }
        // Determine dominant identity
        this.updateDominantIdentity(track);
        // Check if should alert
        const thresholds = watchlistConfig || this.getDefaultThresholds();
        const shouldAlert = this.shouldGenerateAlert(track, thresholds);
        let matchEvent;
        if (shouldAlert && track.dominantIdentity) {
            matchEvent = await this.generateMatchEvent(track, observation, thresholds);
        }
        // Persist track state to database
        await this.persistTrack(track);
        return {
            shouldAlert,
            matchEvent,
            track,
        };
    }
    /**
     * Create new track
     */
    createTrack(trackId, observation) {
        return {
            trackId,
            cameraId: observation.cameraId,
            observations: [],
            firstSeenAt: observation.timestamp,
            lastSeenAt: observation.timestamp,
            identityEvidence: new Map(),
        };
    }
    /**
     * Update identity evidence for track
     */
    updateIdentityEvidence(track, personId, displayName, watchlistId, observation) {
        if (!track.identityEvidence.has(personId)) {
            track.identityEvidence.set(personId, {
                personId,
                displayName,
                watchlistId,
                observations: 0,
                bestSimilarity: 0,
                meanSimilarity: 0,
                maxQuality: 0,
                meanQuality: 0,
            });
        }
        const evidence = track.identityEvidence.get(personId);
        evidence.observations++;
        if (observation.recognition?.status === 'MATCH') {
            const similarity = observation.recognition.similarity;
            evidence.bestSimilarity = Math.max(evidence.bestSimilarity, similarity);
            // Update mean similarity
            const totalSimilarity = evidence.meanSimilarity * (evidence.observations - 1) + similarity;
            evidence.meanSimilarity = totalSimilarity / evidence.observations;
        }
        // Update quality metrics
        const quality = observation.quality.score;
        evidence.maxQuality = Math.max(evidence.maxQuality, quality);
        const totalQuality = evidence.meanQuality * (evidence.observations - 1) + quality;
        evidence.meanQuality = totalQuality / evidence.observations;
    }
    /**
     * Determine dominant identity from accumulated evidence
     */
    updateDominantIdentity(track) {
        if (track.identityEvidence.size === 0) {
            track.dominantIdentity = undefined;
            return;
        }
        // Find identity with most observations and highest mean similarity
        let bestIdentity;
        let bestScore = 0;
        for (const evidence of track.identityEvidence.values()) {
            // Score = observations * mean_similarity
            const score = evidence.observations * evidence.meanSimilarity;
            if (score > bestScore) {
                bestScore = score;
                bestIdentity = {
                    personId: evidence.personId,
                    displayName: evidence.displayName,
                    watchlistId: evidence.watchlistId,
                    confidence: this.calculateTrackConfidence(evidence, track.observations.length),
                };
            }
        }
        track.dominantIdentity = bestIdentity;
    }
    /**
     * Calculate confidence for track identity
     */
    calculateTrackConfidence(evidence, totalObservations) {
        // Base confidence on consistency and quality
        const consistencyRatio = evidence.observations / totalObservations;
        const qualityScore = evidence.meanQuality;
        const similarityScore = evidence.meanSimilarity;
        return (consistencyRatio * 0.4 + qualityScore * 0.3 + similarityScore * 0.3);
    }
    /**
     * Check if track should generate alert
     */
    shouldGenerateAlert(track, config) {
        if (!track.dominantIdentity) {
            return false;
        }
        const evidence = track.identityEvidence.get(track.dominantIdentity.personId);
        if (!evidence) {
            return false;
        }
        // Check minimum observations
        if (evidence.observations < config.temporalConfirmationFrames) {
            return false;
        }
        // Check temporal window
        const trackDuration = (track.lastSeenAt.getTime() - track.firstSeenAt.getTime()) / 1000;
        if (trackDuration > config.temporalWindowSeconds) {
            return false;
        }
        // Check confidence
        if (track.dominantIdentity.confidence < 0.7) {
            return false;
        }
        return true;
    }
    /**
     * Generate match event
     */
    async generateMatchEvent(track, observation, config) {
        const dominant = track.dominantIdentity;
        const evidence = track.identityEvidence.get(dominant.personId);
        // Get watchlist name and tenant info from database
        const watchlistInfo = await this.getWatchlistInfo(dominant.watchlistId);
        // Find second-best identity for margin calculation
        let secondBestSimilarity = 0;
        for (const [personId, ev] of track.identityEvidence.entries()) {
            if (personId !== dominant.personId) {
                secondBestSimilarity = Math.max(secondBestSimilarity, ev.bestSimilarity);
            }
        }
        const margin = evidence.bestSimilarity - secondBestSimilarity;
        return {
            eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            tenantId: watchlistInfo.tenantId,
            cameraId: track.cameraId,
            branchId: watchlistInfo.branchId,
            personId: dominant.personId,
            personName: dominant.displayName,
            watchlistId: dominant.watchlistId,
            watchlistName: watchlistInfo.name,
            similarity: evidence.bestSimilarity,
            confidence: dominant.confidence,
            margin,
            qualityScore: evidence.maxQuality,
            bbox: observation.bbox,
            timestamp: observation.timestamp,
            trackId: track.trackId,
            trackObservations: evidence.observations,
            modelName: observation.embedding?.modelName || 'unknown',
            modelVersion: observation.embedding?.modelVersion || 'unknown',
            threshold: config.matchThreshold,
            snapshotReference: undefined, // To be set by caller
            cropReference: undefined, // To be set by caller
        };
    }
    /**
     * Get watchlist info from database
     */
    async getWatchlistInfo(watchlistId) {
        const result = await this.db.query(`
      SELECT tenant_id, name
      FROM face_watchlists
      WHERE id = $1
    `, [watchlistId]);
        if (result.rows.length === 0) {
            throw new Error('Watchlist not found');
        }
        return {
            tenantId: result.rows[0].tenant_id,
            name: result.rows[0].name,
        };
    }
    /**
     * Persist track to database
     */
    async persistTrack(track) {
        const dominant = track.dominantIdentity;
        const evidence = dominant ? track.identityEvidence.get(dominant.personId) : undefined;
        const sql = `
      INSERT INTO face_tracks (
        id, tenant_id, camera_id, track_id,
        person_id, watchlist_id,
        first_seen_at, last_seen_at, observation_count,
        best_similarity, mean_similarity,
        best_quality, mean_quality,
        status, metadata
      ) VALUES (
        gen_random_uuid(), 
        (SELECT tenant_id FROM cameras WHERE id = $1::uuid LIMIT 1),
        $1, $2,
        $3, $4,
        $5, $6, $7,
        $8, $9,
        $10, $11,
        $12, $13
      )
      ON CONFLICT (track_id) DO UPDATE SET
        last_seen_at = EXCLUDED.last_seen_at,
        observation_count = EXCLUDED.observation_count,
        person_id = EXCLUDED.person_id,
        watchlist_id = EXCLUDED.watchlist_id,
        best_similarity = EXCLUDED.best_similarity,
        mean_similarity = EXCLUDED.mean_similarity,
        best_quality = EXCLUDED.best_quality,
        mean_quality = EXCLUDED.mean_quality,
        status = EXCLUDED.status,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `;
        await this.db.query(sql, [
            track.cameraId,
            track.trackId,
            dominant?.personId || null,
            dominant?.watchlistId || null,
            track.firstSeenAt,
            track.lastSeenAt,
            track.observations.length,
            evidence?.bestSimilarity || null,
            evidence?.meanSimilarity || null,
            evidence?.maxQuality || null,
            evidence?.meanQuality || null,
            dominant ? 'identified' : 'tracking',
            JSON.stringify({
                identities: Array.from(track.identityEvidence.entries()).map(([id, ev]) => ({
                    personId: id,
                    observations: ev.observations,
                    bestSimilarity: ev.bestSimilarity,
                })),
            }),
        ]);
    }
    /**
     * Cleanup expired tracks
     */
    cleanupExpiredTracks() {
        const now = Date.now();
        const expirationMs = this.config.trackExpirationSeconds * 1000;
        for (const [trackId, track] of this.activeTracks.entries()) {
            const age = now - track.lastSeenAt.getTime();
            if (age > expirationMs) {
                this.activeTracks.delete(trackId);
            }
        }
    }
    /**
     * Generate track ID from observation
     */
    generateTrackId(observation) {
        return `${observation.cameraId}_${observation.timestamp.getTime()}_${observation.faceId}`;
    }
    /**
     * Get default thresholds
     */
    getDefaultThresholds() {
        return {
            matchThreshold: 0.70,
            reviewThreshold: 0.60,
            minimumMargin: 0.05,
            minimumQuality: 0.55,
            temporalConfirmationFrames: 3,
            temporalWindowSeconds: 2,
        };
    }
    /**
     * Get active tracks
     */
    getActiveTracks() {
        return Array.from(this.activeTracks.values());
    }
    /**
     * Get track by ID
     */
    getTrack(trackId) {
        return this.activeTracks.get(trackId);
    }
    /**
     * Clear all tracks
     */
    clearTracks() {
        this.activeTracks.clear();
    }
    /**
     * Get statistics
     */
    getStats() {
        const tracks = Array.from(this.activeTracks.values());
        const identified = tracks.filter((t) => t.dominantIdentity).length;
        const avgObservations = tracks.length > 0
            ? tracks.reduce((sum, t) => sum + t.observations.length, 0) / tracks.length
            : 0;
        return {
            activeTrackCount: tracks.length,
            identifiedTrackCount: identified,
            avgObservationsPerTrack: avgObservations,
        };
    }
}
