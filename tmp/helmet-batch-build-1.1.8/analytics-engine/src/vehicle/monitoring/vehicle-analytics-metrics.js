/**
 * Vehicle Analytics Observability Metrics
 * Prometheus-compatible metrics for monitoring ANPR system health
 */
export class VehicleAnalyticsMetrics {
    collector;
    constructor(collector) {
        this.collector = collector;
    }
    // Detection metrics
    recordVehicleDetection(cameraId, vehicleType) {
        this.collector.incrementCounter('vehicle_detections_total', {
            camera_id: cameraId,
            vehicle_type: vehicleType,
        });
    }
    // Tracking metrics
    recordTrackCreated(cameraId) {
        this.collector.incrementCounter('vehicle_tracks_created_total', {
            camera_id: cameraId,
        });
    }
    recordTrackFinalized(cameraId, durationSeconds) {
        this.collector.incrementCounter('vehicle_tracks_finalized_total', {
            camera_id: cameraId,
        });
        this.collector.recordHistogram('vehicle_track_duration_seconds', durationSeconds, {
            camera_id: cameraId,
        });
    }
    setActiveTracks(cameraId, count) {
        this.collector.setGauge('vehicle_active_tracks', count, {
            camera_id: cameraId,
        });
    }
    // ANPR metrics
    recordPlateDetectionAttempt(cameraId) {
        this.collector.incrementCounter('anpr_detection_attempts_total', {
            camera_id: cameraId,
        });
    }
    recordPlateDetected(cameraId, success) {
        this.collector.incrementCounter('anpr_plates_detected_total', {
            camera_id: cameraId,
            success: success ? 'true' : 'false',
        });
    }
    recordOcrAttempt(cameraId) {
        this.collector.incrementCounter('anpr_ocr_attempts_total', {
            camera_id: cameraId,
        });
    }
    recordOcrResult(cameraId, success, confidence) {
        this.collector.incrementCounter('anpr_ocr_results_total', {
            camera_id: cameraId,
            success: success ? 'true' : 'false',
        });
        if (success) {
            this.collector.recordHistogram('anpr_ocr_confidence', confidence, {
                camera_id: cameraId,
            });
        }
    }
    recordOcrLatency(cameraId, latencyMs) {
        this.collector.recordHistogram('anpr_ocr_latency_ms', latencyMs, {
            camera_id: cameraId,
        });
    }
    recordPlateQuality(cameraId, quality) {
        this.collector.recordHistogram('anpr_plate_quality_score', quality, {
            camera_id: cameraId,
        });
    }
    recordPlateConsensus(cameraId, status, observationCount) {
        this.collector.incrementCounter('anpr_consensus_results_total', {
            camera_id: cameraId,
            status,
        });
        this.collector.recordHistogram('anpr_consensus_observations', observationCount, {
            camera_id: cameraId,
        });
    }
    // Color classification metrics
    recordColorClassification(cameraId, color, confidence) {
        this.collector.incrementCounter('vehicle_color_classifications_total', {
            camera_id: cameraId,
            color,
        });
        this.collector.recordHistogram('vehicle_color_confidence', confidence, {
            camera_id: cameraId,
            color,
        });
    }
    // Persistence metrics
    recordEventPersisted(cameraId, hasPlate) {
        this.collector.incrementCounter('vehicle_events_persisted_total', {
            camera_id: cameraId,
            has_plate: hasPlate ? 'true' : 'false',
        });
    }
    recordPersistenceFailure(cameraId, reason) {
        this.collector.incrementCounter('vehicle_persistence_failures_total', {
            camera_id: cameraId,
            reason,
        });
    }
    recordPersistenceLatency(cameraId, latencyMs) {
        this.collector.recordHistogram('vehicle_persistence_latency_ms', latencyMs, {
            camera_id: cameraId,
        });
    }
    // Watchlist metrics
    recordWatchlistCheck(cameraId) {
        this.collector.incrementCounter('watchlist_checks_total', {
            camera_id: cameraId,
        });
    }
    recordWatchlistMatch(cameraId, severity, confidence) {
        this.collector.incrementCounter('watchlist_matches_total', {
            camera_id: cameraId,
            severity,
        });
        this.collector.recordHistogram('watchlist_match_confidence', confidence, {
            camera_id: cameraId,
            severity,
        });
    }
    setWatchlistSize(tenantId, size) {
        this.collector.setGauge('watchlist_entries_count', size, {
            tenant_id: tenantId,
        });
    }
    // Quality metrics
    recordRecognitionSuccessRate(cameraId, rate) {
        this.collector.setGauge('anpr_recognition_success_rate', rate, {
            camera_id: cameraId,
        });
    }
    recordAveragePlateConfidence(cameraId, confidence) {
        this.collector.setGauge('anpr_average_confidence', confidence, {
            camera_id: cameraId,
        });
    }
    // OCR budget metrics
    recordOcrBudgetUsed(cameraId, used, limit) {
        this.collector.setGauge('anpr_ocr_budget_used', used, {
            camera_id: cameraId,
        });
        this.collector.setGauge('anpr_ocr_budget_limit', limit, {
            camera_id: cameraId,
        });
        const utilizationPercent = limit > 0 ? (used / limit) * 100 : 0;
        this.collector.setGauge('anpr_ocr_budget_utilization_percent', utilizationPercent, {
            camera_id: cameraId,
        });
    }
    // Journey metrics
    recordJourneyReconstruction(tenantId, appearanceCount, durationHours) {
        this.collector.incrementCounter('journey_reconstructions_total', {
            tenant_id: tenantId,
        });
        this.collector.recordHistogram('journey_appearance_count', appearanceCount, {
            tenant_id: tenantId,
        });
        this.collector.recordHistogram('journey_duration_hours', durationHours, {
            tenant_id: tenantId,
        });
    }
    recordJourneyValidation(tenantId, isValid, impossibleTransitions) {
        this.collector.incrementCounter('journey_validations_total', {
            tenant_id: tenantId,
            valid: isValid ? 'true' : 'false',
        });
        if (!isValid && impossibleTransitions > 0) {
            this.collector.recordHistogram('journey_impossible_transitions', impossibleTransitions, {
                tenant_id: tenantId,
            });
        }
    }
    // Camera health metrics
    recordCameraHealth(cameraId, isHealthy) {
        this.collector.setGauge('camera_anpr_health', isHealthy ? 1 : 0, {
            camera_id: cameraId,
        });
    }
    recordCameraReadinessScore(cameraId, score) {
        this.collector.setGauge('camera_anpr_readiness_score', score, {
            camera_id: cameraId,
        });
    }
}
/**
 * Simple in-memory metrics collector for testing
 */
export class InMemoryMetricsCollector {
    counters = new Map();
    histograms = new Map();
    gauges = new Map();
    incrementCounter(name, labels) {
        const key = this.makeKey(name, labels);
        this.counters.set(key, (this.counters.get(key) || 0) + 1);
    }
    recordHistogram(name, value, labels) {
        const key = this.makeKey(name, labels);
        const values = this.histograms.get(key) || [];
        values.push(value);
        this.histograms.set(key, values);
    }
    setGauge(name, value, labels) {
        const key = this.makeKey(name, labels);
        this.gauges.set(key, value);
    }
    getCounter(name, labels) {
        return this.counters.get(this.makeKey(name, labels)) || 0;
    }
    getHistogram(name, labels) {
        return this.histograms.get(this.makeKey(name, labels)) || [];
    }
    getGauge(name, labels) {
        return this.gauges.get(this.makeKey(name, labels)) || 0;
    }
    reset() {
        this.counters.clear();
        this.histograms.clear();
        this.gauges.clear();
    }
    makeKey(name, labels) {
        if (!labels)
            return name;
        const labelStr = Object.entries(labels)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
        return `${name}{${labelStr}}`;
    }
    /**
     * Export metrics in Prometheus format
     */
    exportPrometheus() {
        const lines = [];
        // Counters
        for (const [key, value] of this.counters.entries()) {
            lines.push(`${key} ${value}`);
        }
        // Gauges
        for (const [key, value] of this.gauges.entries()) {
            lines.push(`${key} ${value}`);
        }
        // Histograms (simplified - just count and sum)
        for (const [key, values] of this.histograms.entries()) {
            const sum = values.reduce((a, b) => a + b, 0);
            const count = values.length;
            lines.push(`${key}_sum ${sum}`);
            lines.push(`${key}_count ${count}`);
        }
        return lines.join('\n');
    }
}
/**
 * Calculate rolling statistics for quality monitoring
 */
export class QualityMonitor {
    successfulRecognitions = [];
    failedRecognitions = [];
    confidenceScores = [];
    windowSize;
    constructor(windowSize = 100) {
        this.windowSize = windowSize;
    }
    recordRecognition(success, confidence) {
        if (success) {
            this.successfulRecognitions.push(Date.now());
            if (confidence !== undefined) {
                this.confidenceScores.push(confidence);
            }
        }
        else {
            this.failedRecognitions.push(Date.now());
        }
        // Trim to window size
        this.trim();
    }
    getSuccessRate() {
        const total = this.successfulRecognitions.length + this.failedRecognitions.length;
        if (total === 0)
            return 0;
        return this.successfulRecognitions.length / total;
    }
    getAverageConfidence() {
        if (this.confidenceScores.length === 0)
            return 0;
        return this.confidenceScores.reduce((a, b) => a + b, 0) / this.confidenceScores.length;
    }
    getRecentThroughput(lastSeconds = 60) {
        const cutoff = Date.now() - lastSeconds * 1000;
        const recent = this.successfulRecognitions.filter(t => t >= cutoff);
        return recent.length / lastSeconds;
    }
    trim() {
        if (this.successfulRecognitions.length > this.windowSize) {
            this.successfulRecognitions = this.successfulRecognitions.slice(-this.windowSize);
        }
        if (this.failedRecognitions.length > this.windowSize) {
            this.failedRecognitions = this.failedRecognitions.slice(-this.windowSize);
        }
        if (this.confidenceScores.length > this.windowSize) {
            this.confidenceScores = this.confidenceScores.slice(-this.windowSize);
        }
    }
    reset() {
        this.successfulRecognitions = [];
        this.failedRecognitions = [];
        this.confidenceScores = [];
    }
}
