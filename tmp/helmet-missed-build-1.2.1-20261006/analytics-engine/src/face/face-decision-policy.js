/**
 * Face Recognition Decision Policy
 * Converts raw similarity scores into business decisions
 */
export class FaceDecisionPolicy {
    config;
    constructor(config) {
        this.config = {
            defaultMatchThreshold: 0.70,
            defaultReviewThreshold: 0.60,
            defaultMinimumMargin: 0.05,
            defaultMinimumQuality: 0.55,
            enableSecondBestMargin: true,
            enableQualityGating: true,
            ...config,
        };
    }
    /**
     * Evaluate candidates and make recognition decision
     */
    evaluate(candidates, quality, watchlistConfig) {
        // Use watchlist-specific config or defaults
        const thresholds = this.getThresholds(watchlistConfig);
        // Check quality first
        if (this.config.enableQualityGating && quality) {
            if (!quality.acceptable || quality.score < thresholds.minimumQuality) {
                return {
                    status: 'FACE_TOO_LOW_QUALITY',
                    qualityScore: quality.score,
                    reasons: quality.reasons,
                };
            }
        }
        // No candidates
        if (candidates.length === 0) {
            return {
                status: 'UNKNOWN',
            };
        }
        // Get best and second-best candidates
        const best = candidates[0];
        const secondBest = candidates.length > 1 ? candidates[1] : null;
        // Calculate margin
        const margin = secondBest
            ? best.bestSimilarity - secondBest.bestSimilarity
            : 1.0; // If only one candidate, margin is maximum
        // Decision: MATCH
        if (best.bestSimilarity >= thresholds.matchThreshold &&
            (!this.config.enableSecondBestMargin || margin >= thresholds.minimumMargin)) {
            return {
                status: 'MATCH',
                personId: best.personId,
                displayName: best.displayName,
                watchlistId: best.watchlistId,
                similarity: best.bestSimilarity,
                margin,
                confidence: this.calculateConfidence(best.bestSimilarity, margin, best.supportingEmbeddings),
            };
        }
        // Decision: POSSIBLE_MATCH
        if (best.bestSimilarity >= thresholds.reviewThreshold) {
            // Include top candidates for human review
            const reviewCandidates = candidates
                .filter((c) => c.bestSimilarity >= thresholds.reviewThreshold)
                .slice(0, 3);
            return {
                status: 'POSSIBLE_MATCH',
                candidates: reviewCandidates,
                topSimilarity: best.bestSimilarity,
                margin,
            };
        }
        // Decision: UNKNOWN
        return {
            status: 'UNKNOWN',
            topSimilarity: best.bestSimilarity,
        };
    }
    /**
     * Evaluate with explicit thresholds
     */
    evaluateWithThresholds(candidates, matchThreshold, reviewThreshold, minimumMargin, quality) {
        return this.evaluate(candidates, quality, {
            matchThreshold,
            reviewThreshold,
            minimumMargin,
            minimumQuality: this.config.defaultMinimumQuality,
            temporalConfirmationFrames: 3,
            temporalWindowSeconds: 2,
        });
    }
    /**
     * Calculate confidence score for a match
     */
    calculateConfidence(similarity, margin, supportingEmbeddings) {
        // Base confidence on similarity
        let confidence = similarity;
        // Boost for good margin
        if (margin > 0.15) {
            confidence = Math.min(1.0, confidence * 1.05);
        }
        else if (margin < 0.05) {
            confidence = confidence * 0.95;
        }
        // Boost for multiple supporting embeddings
        if (supportingEmbeddings >= 3) {
            confidence = Math.min(1.0, confidence * 1.03);
        }
        return Math.max(0, Math.min(1, confidence));
    }
    /**
     * Get thresholds (watchlist-specific or defaults)
     */
    getThresholds(watchlistConfig) {
        if (watchlistConfig) {
            return watchlistConfig;
        }
        return {
            matchThreshold: this.config.defaultMatchThreshold,
            reviewThreshold: this.config.defaultReviewThreshold,
            minimumMargin: this.config.defaultMinimumMargin,
            minimumQuality: this.config.defaultMinimumQuality,
            temporalConfirmationFrames: 3,
            temporalWindowSeconds: 2,
        };
    }
    /**
     * Evaluate if a match should trigger an alert
     */
    shouldAlert(decision, watchlistAlertOnMatch) {
        if (!watchlistAlertOnMatch) {
            return false;
        }
        // Only alert on definitive matches
        return decision.status === 'MATCH';
    }
    /**
     * Evaluate if a match should trigger human review
     */
    shouldReview(decision) {
        return decision.status === 'POSSIBLE_MATCH';
    }
    /**
     * Get alert severity based on similarity and context
     */
    getAlertSeverity(decision, watchlistType) {
        if (decision.status !== 'MATCH') {
            return 'P5';
        }
        // Blacklist/security matches are high priority
        if (watchlistType === 'blacklist' || watchlistType === 'security') {
            return decision.similarity >= 0.85 ? 'P1' : 'P2';
        }
        // VIP matches are medium-high priority
        if (watchlistType === 'vip') {
            return 'P2';
        }
        // Staff matches are low priority
        if (watchlistType === 'staff') {
            return 'P4';
        }
        // Default
        return 'P3';
    }
    /**
     * Generate human-readable explanation
     */
    explainDecision(decision) {
        switch (decision.status) {
            case 'MATCH':
                return (`Identified as ${decision.displayName} ` +
                    `(similarity: ${(decision.similarity * 100).toFixed(1)}%, ` +
                    `margin: ${(decision.margin * 100).toFixed(1)}%, ` +
                    `confidence: ${(decision.confidence * 100).toFixed(1)}%)`);
            case 'POSSIBLE_MATCH':
                return (`Possible match found (top similarity: ${(decision.topSimilarity * 100).toFixed(1)}%). ` +
                    `${decision.candidates.length} candidate(s) require human review.`);
            case 'UNKNOWN':
                return decision.topSimilarity
                    ? `No match found (best similarity: ${(decision.topSimilarity * 100).toFixed(1)}%)`
                    : 'No match found in watchlist';
            case 'FACE_TOO_LOW_QUALITY':
                return (`Face quality too low for recognition ` +
                    `(score: ${(decision.qualityScore * 100).toFixed(1)}%). ` +
                    `Reasons: ${decision.reasons.join(', ')}`);
            case 'MODEL_UNAVAILABLE':
                return `Face recognition model unavailable: ${decision.error}`;
            case 'SEARCH_UNAVAILABLE':
                return `Face search unavailable: ${decision.error}`;
            default:
                return 'Unknown decision status';
        }
    }
    /**
     * Validate thresholds
     */
    validateThresholds(config) {
        const errors = [];
        if (config.matchThreshold <= config.reviewThreshold) {
            errors.push('Match threshold must be greater than review threshold');
        }
        if (config.matchThreshold < 0.4 || config.matchThreshold > 0.95) {
            errors.push('Match threshold must be between 0.4 and 0.95');
        }
        if (config.reviewThreshold < 0.3 || config.reviewThreshold > 0.90) {
            errors.push('Review threshold must be between 0.3 and 0.90');
        }
        if (config.minimumMargin < 0.01 || config.minimumMargin > 0.30) {
            errors.push('Minimum margin must be between 0.01 and 0.30');
        }
        if (config.minimumQuality < 0.3 || config.minimumQuality > 0.95) {
            errors.push('Minimum quality must be between 0.3 and 0.95');
        }
        return {
            valid: errors.length === 0,
            errors,
        };
    }
    /**
     * Suggest thresholds based on use case
     */
    suggestThresholds(useCase) {
        switch (useCase) {
            case 'high-security':
                // Minimize false positives (blacklist, security)
                return {
                    matchThreshold: 0.80,
                    reviewThreshold: 0.70,
                    minimumMargin: 0.10,
                    minimumQuality: 0.70,
                    temporalConfirmationFrames: 5,
                    temporalWindowSeconds: 3,
                };
            case 'high-recall':
                // Minimize false negatives (missing persons, access control)
                return {
                    matchThreshold: 0.65,
                    reviewThreshold: 0.55,
                    minimumMargin: 0.03,
                    minimumQuality: 0.50,
                    temporalConfirmationFrames: 2,
                    temporalWindowSeconds: 2,
                };
            case 'balanced':
            default:
                // Balance precision and recall (VIP, staff)
                return {
                    matchThreshold: 0.70,
                    reviewThreshold: 0.60,
                    minimumMargin: 0.05,
                    minimumQuality: 0.55,
                    temporalConfirmationFrames: 3,
                    temporalWindowSeconds: 2,
                };
        }
    }
    /**
     * Update configuration
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
}
