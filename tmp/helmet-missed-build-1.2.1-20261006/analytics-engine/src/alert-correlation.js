/**
 * Alert Correlation & Management
 *
 * Reduces false positives and noise by:
 * - Deduplicating similar alerts
 * - Correlating related events
 * - Applying temporal filtering
 * - Grouping multi-detector alerts
 * - Managing alert lifecycle (open, acknowledged, resolved)
 */
// ============================================================================
// Alert Correlation Engine
// ============================================================================
export class AlertCorrelationEngine {
    alerts = new Map();
    recentDetections = new Map();
    correlationRules = [];
    config;
    DEFAULT_CONFIG = {
        enableDeduplication: true,
        deduplicationWindowSeconds: 60,
        enableTemporalFiltering: true,
        minOccurrencesBeforeAlert: 2,
        enableSpatialCorrelation: true,
        spatialProximityMeters: 10,
        autoResolveAfterSeconds: 300,
        suppressRepeatedAlertsSeconds: 60
    };
    constructor(config = {}) {
        this.config = { ...this.DEFAULT_CONFIG, ...config };
        this.initializeDefaultRules();
        this.startCleanupTimer();
    }
    /**
     * Process detection result and generate alerts
     */
    async processDetection(detection, cameraId, tenantId, timestamp = new Date()) {
        // Skip if detection doesn't require alert
        if (!detection.requiresAlert) {
            return [];
        }
        const newAlerts = [];
        // Store detection for temporal analysis
        this.storeRecentDetection(detection, cameraId, timestamp);
        // Check if we should suppress this alert (deduplication)
        if (this.config.enableDeduplication) {
            const existingAlert = this.findDuplicateAlert(detection, cameraId, timestamp);
            if (existingAlert) {
                // Update existing alert
                existingAlert.lastSeen = timestamp;
                existingAlert.occurrences++;
                existingAlert.confidence = Math.max(existingAlert.confidence, detection.confidence);
                // Escalate if occurrences threshold reached
                if (existingAlert.occurrences >= 5 && existingAlert.severity !== 'critical') {
                    existingAlert.severity = this.escalateSeverity(existingAlert.severity);
                }
                return [existingAlert];
            }
        }
        // Check temporal filtering (must occur multiple times)
        if (this.config.enableTemporalFiltering) {
            const occurrences = this.countRecentOccurrences(detection.detectionType, cameraId);
            if (occurrences < this.config.minOccurrencesBeforeAlert) {
                // Not enough occurrences yet, don't create alert
                return [];
            }
        }
        // Create new alert
        const alert = this.createAlert(detection, cameraId, tenantId, timestamp);
        this.alerts.set(alert.id, alert);
        newAlerts.push(alert);
        // Check correlation rules
        const correlatedAlerts = await this.applyCorrelationRules(alert, timestamp);
        newAlerts.push(...correlatedAlerts);
        return newAlerts;
    }
    /**
     * Create alert from detection
     */
    createAlert(detection, cameraId, tenantId, timestamp) {
        return {
            id: this.generateAlertId(),
            detectionType: detection.detectionType,
            category: this.categorizeAlert(detection.detectionType),
            severity: this.calculateSeverity(detection),
            status: 'open',
            title: this.generateAlertTitle(detection),
            description: this.generateAlertDescription(detection),
            cameraId,
            tenantId,
            timestamp,
            firstSeen: timestamp,
            lastSeen: timestamp,
            occurrences: 1,
            confidence: detection.confidence,
            metadata: detection.metadata || {},
            relatedAlerts: []
        };
    }
    /**
     * Find duplicate alert within deduplication window
     */
    findDuplicateAlert(detection, cameraId, timestamp) {
        const windowMs = this.config.deduplicationWindowSeconds * 1000;
        for (const alert of this.alerts.values()) {
            // Check if same detection type and camera
            if (alert.detectionType !== detection.detectionType || alert.cameraId !== cameraId) {
                continue;
            }
            // Check if within time window
            const timeDiff = timestamp.getTime() - alert.lastSeen.getTime();
            if (timeDiff > windowMs) {
                continue;
            }
            // Check if suppression period active
            if (alert.suppressedUntil && timestamp < alert.suppressedUntil) {
                continue;
            }
            // Found duplicate
            return alert;
        }
        return undefined;
    }
    /**
     * Store detection for temporal analysis
     */
    storeRecentDetection(detection, cameraId, timestamp) {
        const key = `${detection.detectionType}:${cameraId}`;
        if (!this.recentDetections.has(key)) {
            this.recentDetections.set(key, []);
        }
        const detections = this.recentDetections.get(key);
        detections.push({ detection, timestamp, cameraId });
        // Keep only recent detections (last 5 minutes)
        const cutoff = new Date(timestamp.getTime() - 5 * 60 * 1000);
        const filtered = detections.filter(d => d.timestamp > cutoff);
        this.recentDetections.set(key, filtered);
    }
    /**
     * Count recent occurrences of detection type
     */
    countRecentOccurrences(detectionType, cameraId) {
        const key = `${detectionType}:${cameraId}`;
        const detections = this.recentDetections.get(key) || [];
        const windowMs = this.config.deduplicationWindowSeconds * 1000;
        const cutoff = new Date(Date.now() - windowMs);
        return detections.filter(d => d.timestamp > cutoff).length;
    }
    /**
     * Apply correlation rules to create composite alerts
     */
    async applyCorrelationRules(alert, timestamp) {
        const correlatedAlerts = [];
        for (const rule of this.correlationRules) {
            // Check if alert matches rule
            if (!rule.detectionTypes.includes(alert.detectionType)) {
                continue;
            }
            // Find related alerts within time window
            const relatedAlerts = this.findRelatedAlerts(alert, rule.detectionTypes, rule.timeWindowSeconds, timestamp, rule);
            if (relatedAlerts.length >= rule.minimumOccurrences) {
                // Create or update correlated alert
                const correlatedAlert = this.createCorrelatedAlert(alert, relatedAlerts, rule, timestamp);
                if (correlatedAlert) {
                    this.alerts.set(correlatedAlert.id, correlatedAlert);
                    correlatedAlerts.push(correlatedAlert);
                    // Link related alerts
                    for (const related of relatedAlerts) {
                        if (!related.relatedAlerts)
                            related.relatedAlerts = [];
                        if (!related.relatedAlerts.includes(correlatedAlert.id)) {
                            related.relatedAlerts.push(correlatedAlert.id);
                        }
                    }
                }
            }
        }
        return correlatedAlerts;
    }
    /**
     * Find related alerts matching correlation criteria
     */
    findRelatedAlerts(alert, detectionTypes, timeWindowSeconds, timestamp, rule) {
        const windowMs = timeWindowSeconds * 1000;
        const cutoff = new Date(timestamp.getTime() - windowMs);
        const related = [];
        for (const candidate of this.alerts.values()) {
            // Skip self
            if (candidate.id === alert.id)
                continue;
            // Verify tenant boundary
            if (alert.tenantId && candidate.tenantId && alert.tenantId !== candidate.tenantId) {
                continue;
            }
            // Check detection type
            if (!detectionTypes.includes(candidate.detectionType))
                continue;
            // Check time window
            if (candidate.timestamp < cutoff)
                continue;
            // Check camera proximity unless crossCamera correlation is enabled for this rule
            if (!rule?.crossCamera && this.config.enableSpatialCorrelation && candidate.cameraId !== alert.cameraId) {
                continue;
            }
            related.push(candidate);
        }
        return related;
    }
    /**
     * Create correlated alert from multiple related alerts
     */
    createCorrelatedAlert(primaryAlert, relatedAlerts, rule, timestamp) {
        if (rule.action === 'suppress') {
            // Suppress all related alerts
            for (const alert of [primaryAlert, ...relatedAlerts]) {
                alert.status = 'suppressed';
                alert.suppressedUntil = new Date(timestamp.getTime() +
                    this.config.suppressRepeatedAlertsSeconds * 1000);
            }
            return null;
        }
        const allAlerts = [primaryAlert, ...relatedAlerts];
        const avgConfidence = allAlerts.reduce((sum, a) => sum + a.confidence, 0) / allAlerts.length;
        const cameraIds = Array.from(new Set(allAlerts.map(a => a.cameraId)));
        const isCrossCamera = cameraIds.length > 1;
        return {
            id: this.generateAlertId(),
            detectionType: `correlated:${rule.id}`,
            category: primaryAlert.category,
            severity: rule.targetSeverity || this.escalateSeverity(primaryAlert.severity),
            status: 'open',
            title: isCrossCamera ? `Multi-Camera Alert: ${rule.name}` : `Multiple incidents detected: ${rule.name}`,
            description: isCrossCamera
                ? `Correlated ${allAlerts.length} incidents across ${cameraIds.length} cameras (${cameraIds.join(', ')}) within ${rule.timeWindowSeconds}s`
                : `Correlated ${allAlerts.length} related incidents within ${rule.timeWindowSeconds}s`,
            cameraId: primaryAlert.cameraId,
            tenantId: primaryAlert.tenantId,
            timestamp,
            firstSeen: new Date(Math.min(...allAlerts.map(a => a.firstSeen ? new Date(a.firstSeen).getTime() : new Date(a.timestamp).getTime()))),
            lastSeen: timestamp,
            occurrences: allAlerts.reduce((sum, a) => sum + a.occurrences, 0),
            confidence: avgConfidence,
            metadata: {
                correlationRule: rule.id,
                crossCamera: isCrossCamera,
                cameraIds,
                relatedDetectionTypes: Array.from(new Set(allAlerts.map(a => a.detectionType))),
                relatedAlertIds: allAlerts.map(a => a.id)
            },
            relatedAlerts: allAlerts.map(a => a.id)
        };
    }
    /**
     * Initialize default correlation rules
     */
    initializeDefaultRules() {
        this.correlationRules = [
            {
                id: 'fire-spread',
                name: 'Fire Spreading',
                detectionTypes: ['fire', 'smoke'],
                timeWindowSeconds: 120,
                minimumOccurrences: 3,
                action: 'escalate',
                targetSeverity: 'critical'
            },
            {
                id: 'security-breach',
                name: 'Security Breach',
                detectionTypes: ['intrusion', 'loitering', 'tailgating'],
                timeWindowSeconds: 180,
                minimumOccurrences: 2,
                action: 'correlate',
                targetSeverity: 'high'
            },
            {
                id: 'cross-camera-suspect-tracking',
                name: 'Multi-Camera Suspect Trajectory',
                detectionTypes: ['intrusion', 'loitering', 'tailgating', 'after-hours-person', 'employee-only-zone'],
                timeWindowSeconds: 300,
                minimumOccurrences: 2,
                action: 'correlate',
                targetSeverity: 'high',
                crossCamera: true
            },
            {
                id: 'cross-camera-vehicle-tracking',
                name: 'Multi-Camera Vehicle Movement',
                detectionTypes: ['vehicle-overspeeding', 'vehicle-wrong-way', 'vehicle-watchlist-match', 'wrong_direction', 'vehicle'],
                timeWindowSeconds: 240,
                minimumOccurrences: 2,
                action: 'correlate',
                targetSeverity: 'high',
                crossCamera: true
            },
            {
                id: 'bank-breach-escalation',
                name: 'Coordinated Bank Security Breach',
                detectionTypes: ['door-forced', 'vault_intrusion', 'atm-tampering', 'after-hours-person', 'cash-counter-crowd'],
                timeWindowSeconds: 360,
                minimumOccurrences: 2,
                action: 'escalate',
                targetSeverity: 'critical',
                crossCamera: true
            },
            {
                id: 'crowd-disturbance',
                name: 'Crowd Disturbance',
                detectionTypes: ['fighting-detected', 'running', 'crowd-density-high'],
                timeWindowSeconds: 60,
                minimumOccurrences: 2,
                action: 'escalate',
                targetSeverity: 'high'
            },
            {
                id: 'ppe-violations',
                name: 'Multiple PPE Violations',
                detectionTypes: ['no-helmet', 'no-vest'],
                timeWindowSeconds: 300,
                minimumOccurrences: 5,
                action: 'correlate',
                targetSeverity: 'medium'
            }
        ];
    }
    /**
     * Categorize alert by detection type
     */
    categorizeAlert(detectionType) {
        const safetyTypes = ['fire', 'smoke', 'fall', 'fighting-detected', 'person-down'];
        const securityTypes = ['intrusion', 'loitering', 'tailgating', 'watchlist-match', 'unknown-person'];
        const complianceTypes = ['no-helmet', 'helmet-worn', 'no-vest', 'vehicle-overspeeding', 'vehicle-wrong-way'];
        const operationalTypes = ['crowd-density-high', 'queue-length-exceeded', 'parking-overstay'];
        if (safetyTypes.some(t => detectionType.includes(t)))
            return 'safety';
        if (securityTypes.some(t => detectionType.includes(t)))
            return 'security';
        if (complianceTypes.some(t => detectionType.includes(t)))
            return 'compliance';
        if (operationalTypes.some(t => detectionType.includes(t)))
            return 'operational';
        return 'informational';
    }
    /**
     * Calculate alert severity
     */
    calculateSeverity(detection) {
        const { detectionType, confidence } = detection;
        // Critical severity
        const criticalTypes = ['fire', 'blacklist_detected', 'fighting-detected'];
        if (criticalTypes.some(t => detectionType.includes(t)))
            return 'critical';
        // High severity
        const highTypes = ['smoke', 'fall', 'intrusion', 'weapon-detected', 'vehicle-overspeeding'];
        if (highTypes.some(t => detectionType.includes(t)))
            return 'high';
        // Medium severity
        const mediumTypes = ['loitering', 'tailgating', 'no-helmet', 'helmet-worn', 'vehicle-wrong-way', 'unknown-person'];
        if (mediumTypes.some(t => detectionType.includes(t)))
            return 'medium';
        // Low severity with high confidence
        if (confidence >= 0.9)
            return 'medium';
        if (confidence >= 0.7)
            return 'low';
        return 'info';
    }
    /**
     * Escalate severity to next level
     */
    escalateSeverity(current) {
        const levels = ['info', 'low', 'medium', 'high', 'critical'];
        const index = levels.indexOf(current);
        return levels[Math.min(index + 1, levels.length - 1)];
    }
    /**
     * Generate alert title
     */
    generateAlertTitle(detection) {
        const titles = {
            'fire': 'Fire Detected',
            'smoke': 'Smoke Detected',
            'fall': 'Person Fall Detected',
            'fighting-detected': 'Fighting Detected',
            'loitering': 'Loitering Detected',
            'tailgating': 'Tailgating Detected',
            'intrusion': 'Intrusion Detected',
            'helmet-worn': 'Security Alert: Helmet Worn Inside Bank',
            'helmet': 'Security Alert: Helmet / Face Cover Detected',
            'no-helmet': 'Vehicle Rider Without Helmet',
            'no-vest': 'PPE Violation: No Vest',
            'vehicle-overspeeding': 'Vehicle Overspeeding',
            'vehicle-wrong-way': 'Wrong-Way Vehicle',
            'watchlist-match': 'Watchlist Match',
            'unknown-person': 'Unknown Person Detected',
            'blacklist_detected': 'Blacklist Person Detected',
            'crowd-density-high': 'High Crowd Density',
            'queue-length-exceeded': 'Queue Length Exceeded'
        };
        return titles[detection.detectionType] || `${detection.detectionType} Detected`;
    }
    /**
     * Generate alert description
     */
    generateAlertDescription(detection) {
        const objectCount = detection.objects?.length || 0;
        const confidence = Math.round(detection.confidence * 100);
        let desc = `${this.generateAlertTitle(detection)} with ${confidence}% confidence.`;
        if (objectCount > 0) {
            desc += ` ${objectCount} object(s) detected.`;
        }
        return desc;
    }
    /**
     * Generate unique alert ID
     */
    generateAlertId() {
        return `alert_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    /**
     * Add custom correlation rule
     */
    addCorrelationRule(rule) {
        this.correlationRules.push(rule);
    }
    /**
     * Get alert by ID
     */
    getAlert(alertId) {
        return this.alerts.get(alertId);
    }
    /**
     * Get all alerts
     */
    getAllAlerts(filters) {
        let alerts = Array.from(this.alerts.values());
        if (filters) {
            if (filters.status) {
                alerts = alerts.filter(a => a.status === filters.status);
            }
            if (filters.severity) {
                alerts = alerts.filter(a => a.severity === filters.severity);
            }
            if (filters.category) {
                alerts = alerts.filter(a => a.category === filters.category);
            }
            if (filters.cameraId) {
                alerts = alerts.filter(a => a.cameraId === filters.cameraId);
            }
            if (filters.tenantId) {
                alerts = alerts.filter(a => a.tenantId === filters.tenantId);
            }
            if (filters.since) {
                alerts = alerts.filter(a => a.timestamp >= filters.since);
            }
        }
        return alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }
    /**
     * Acknowledge alert
     */
    acknowledgeAlert(alertId, acknowledgedBy) {
        const alert = this.alerts.get(alertId);
        if (!alert)
            return false;
        alert.status = 'acknowledged';
        alert.acknowledgedBy = acknowledgedBy;
        alert.acknowledgedAt = new Date();
        return true;
    }
    /**
     * Resolve alert
     */
    resolveAlert(alertId) {
        const alert = this.alerts.get(alertId);
        if (!alert)
            return false;
        alert.status = 'resolved';
        alert.resolvedAt = new Date();
        return true;
    }
    /**
     * Auto-resolve old alerts
     */
    startCleanupTimer() {
        setInterval(() => {
            const now = Date.now();
            const autoResolveMs = this.config.autoResolveAfterSeconds * 1000;
            for (const alert of this.alerts.values()) {
                // Auto-resolve old open alerts
                if (alert.status === 'open') {
                    const age = now - alert.lastSeen.getTime();
                    if (age > autoResolveMs) {
                        alert.status = 'resolved';
                        alert.resolvedAt = new Date();
                    }
                }
                // Remove very old resolved alerts (keep last 1000)
                if (alert.status === 'resolved' && alert.resolvedAt) {
                    const resolvedAge = now - alert.resolvedAt.getTime();
                    if (resolvedAge > 24 * 60 * 60 * 1000) { // 24 hours
                        const allAlerts = Array.from(this.alerts.values())
                            .filter(a => a.status === 'resolved')
                            .sort((a, b) => (b.resolvedAt?.getTime() || 0) - (a.resolvedAt?.getTime() || 0));
                        if (allAlerts.length > 1000) {
                            // Keep only latest 1000
                            const toRemove = allAlerts.slice(1000);
                            for (const old of toRemove) {
                                this.alerts.delete(old.id);
                            }
                        }
                    }
                }
            }
        }, 60000); // Every minute
    }
    /**
     * Get statistics
     */
    getStats() {
        const alerts = Array.from(this.alerts.values());
        return {
            total: alerts.length,
            byStatus: {
                open: alerts.filter(a => a.status === 'open').length,
                acknowledged: alerts.filter(a => a.status === 'acknowledged').length,
                resolved: alerts.filter(a => a.status === 'resolved').length,
                suppressed: alerts.filter(a => a.status === 'suppressed').length
            },
            bySeverity: {
                critical: alerts.filter(a => a.severity === 'critical').length,
                high: alerts.filter(a => a.severity === 'high').length,
                medium: alerts.filter(a => a.severity === 'medium').length,
                low: alerts.filter(a => a.severity === 'low').length,
                info: alerts.filter(a => a.severity === 'info').length
            },
            byCategory: {
                safety: alerts.filter(a => a.category === 'safety').length,
                security: alerts.filter(a => a.category === 'security').length,
                compliance: alerts.filter(a => a.category === 'compliance').length,
                operational: alerts.filter(a => a.category === 'operational').length,
                informational: alerts.filter(a => a.category === 'informational').length
            },
            correlationRules: this.correlationRules.length
        };
    }
}
